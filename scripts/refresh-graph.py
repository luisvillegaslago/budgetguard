#!/usr/bin/env python3
"""Rebuild the graphify knowledge graph safely.

Use this instead of `graphify update .`. It does the same free AST re-extraction,
but it will not silently throw away the two things that cost real money:

  1. The semantic layer. `graphify update` merges onto the EXISTING graph.json and
     never re-merges `.graphify_semantic.json`. Delete graph.json, run `update`,
     and the semantic nodes collapse (measured here: 334 -> 11) with nothing
     printed. This script always re-merges from `.graphify_semantic.json`, and
     refuses to write a graph that would lose a semantic layer the current one has.

  2. The curated community names. Community ids are reassigned by Louvain on every
     re-cluster, so a label keyed by cid lands on a different community. graphify
     already guards this correctly by comparing per-community membership signatures
     (`community_member_sigs`) — but ONLY when `.graphify_labels.json.sig` exists.
     Without the sidecar it falls back to "same community count means unchanged",
     which is how curated names end up on the wrong community. This script always
     writes the sidecar, and additionally re-attaches curated names by their
     community's structural hub so they survive a re-cluster instead of being
     replaced by a bare hub name.

Counting doc<->code edges does NOT tell you whether the semantic layer survived:
`update` re-extracts .md files with a shallow heading extractor and writes them as
`_origin: 'ast'`, so the edge count stays high while the content is gone. Count
`_origin` instead — that is what the summary below reports.
"""

from __future__ import annotations

import json
import subprocess
import sys
from collections import Counter
from pathlib import Path

from graphify.analyze import god_nodes, suggest_questions, surprising_connections
from graphify.build import build_from_json
from graphify.cluster import (
    cluster,
    community_member_sigs,
    label_communities_by_hub,
    score_all,
)
from graphify.detect import detect
from graphify.export import to_json
from graphify.extract import collect_files, extract
from graphify.report import generate

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "graphify-out"

DETECT = OUT / ".graphify_detect.json"
AST = OUT / ".graphify_ast.json"
SEMANTIC = OUT / ".graphify_semantic.json"
EXTRACT = OUT / ".graphify_extract.json"
GRAPH = OUT / "graph.json"
LABELS = OUT / ".graphify_labels.json"
SIG = OUT / ".graphify_labels.json.sig"
CURATED = OUT / ".graphify_curated_labels.json"

AUTO_SUFFIX = " (auto)"


def die(message: str) -> None:
    print(f"\nREFUSING TO REBUILD: {message}", file=sys.stderr)
    raise SystemExit(1)


def semantic_node_count(graph_file: Path) -> int:
    """Nodes in an existing graph.json that did not come from the AST pass."""
    if not graph_file.exists():
        return 0
    try:
        g = json.loads(graph_file.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return 0
    return sum(1 for n in g.get("nodes", []) if n.get("_origin") != "ast")


MIN_SIMILARITY = 0.25
MAX_ANCHOR_MEMBERS = 250


def anchor_of(G, members: list[str]) -> list[str]:
    """The community's membership, as its fingerprint.

    Deliberately NOT the top members by degree. That was tried and it misattached
    names: the highest-degree nodes are god-nodes — `types/finance.ts` at degree 340,
    `useApiMutation()`, `invalidateQueryKeys()` — and a god-node belongs to every
    community equally, so anchoring on one anchors on nothing. The result was
    "Fiscal & Trips Screens" sitting on a community that was 61/64 hooks: a correct
    name over foreign content, which reads as an answer and is worse than no name.

    Whole membership, compared by Jaccard below, uses the entire signal instead of
    five nodes that happen to be hubs.
    """
    present = sorted(n for n in members if n in G)
    return present[:MAX_ANCHOR_MEMBERS]


def similarity(stored: list[str], candidate: list[str]) -> float:
    """Jaccard overlap between a stored membership and a community's current one."""
    a, b = set(stored), set(candidate)
    union = a | b
    return len(a & b) / len(union) if union else 0.0


def load_curated(G, communities: dict[int, list[str]]) -> dict[str, str]:
    """Curated labels as {name: [anchor node ids]}.

    Bootstraps from the cid-keyed `.graphify_labels.json` the first time, so the
    names curated before this script existed are not lost. Auto-derived names are
    skipped: they carry no human judgement and are cheaper to recompute than to
    carry around.
    """
    if CURATED.exists():
        return json.loads(CURATED.read_text(encoding="utf-8"))

    if not LABELS.exists():
        return {}

    old = json.loads(LABELS.read_text(encoding="utf-8"))
    anchored: dict[str, list[str]] = {}
    for cid_str, name in old.items():
        if name.endswith(AUTO_SUFFIX) or name.startswith("Community "):
            continue
        members = communities.get(int(cid_str))
        if not members:
            continue
        anchor = anchor_of(G, members)
        if anchor:
            anchored[name] = anchor
    CURATED.write_text(json.dumps(anchored, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"  bootstrapped {len(anchored)} curated labels from .graphify_labels.json")
    return anchored


def main() -> None:
    OUT.mkdir(exist_ok=True)
    previous_semantic = semantic_node_count(GRAPH)

    # detect() fresh every run. Reading the sidecar means a file created since the
    # last detection never enters the graph, and the graph does not look broken --
    # it simply does not contain it.
    print("detecting...")
    detection = detect(ROOT)
    DETECT.write_text(json.dumps(detection, ensure_ascii=False), encoding="utf-8")
    files = detection.get("files", {})
    print(
        f"  {detection['total_files']} files "
        f"({len(files.get('code', []))} code, {len(files.get('document', []))} docs)"
    )

    print("extracting code (AST, no tokens)...")
    code_files: list[Path] = []
    for f in files.get("code", []):
        p = Path(f)
        code_files.extend(collect_files(p) if p.is_dir() else [p])
    ast = extract(code_files, cache_root=ROOT)
    AST.write_text(json.dumps(ast, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"  AST: {len(ast['nodes'])} nodes, {len(ast['edges'])} edges")

    # The guard. A rebuild that drops an existing semantic layer is never what the
    # caller wanted, and it is invisible in every aggregate except this one.
    sem = {"nodes": [], "edges": [], "hyperedges": []}
    if SEMANTIC.exists():
        sem = json.loads(SEMANTIC.read_text(encoding="utf-8"))
    if previous_semantic and not sem.get("nodes"):
        die(
            f"the current graph has {previous_semantic} semantic nodes but "
            f"{SEMANTIC.name} is missing or empty.\n"
            f"Rebuilding now would discard the document-extraction layer.\n"
            f"Restore {SEMANTIC} (it is versioned) before re-running."
        )
    print(f"  semantic layer: {len(sem.get('nodes', []))} nodes re-merged")

    seen = {n["id"] for n in ast["nodes"]}
    merged_nodes = list(ast["nodes"])
    for n in sem.get("nodes", []):
        if n["id"] not in seen:
            # Tag the provenance the way graphify's own pipeline does. This is the
            # only field that distinguishes the paid document-extraction layer from
            # the free heading extractor, so the summary below is only honest if
            # every merged node carries it.
            merged_nodes.append({**n, "_origin": "semantic"})
            seen.add(n["id"])
    extraction = {
        "nodes": merged_nodes,
        "edges": ast["edges"] + sem.get("edges", []),
        "hyperedges": sem.get("hyperedges", []),
        "input_tokens": sem.get("input_tokens", 0),
        "output_tokens": sem.get("output_tokens", 0),
    }
    EXTRACT.write_text(json.dumps(extraction, indent=2, ensure_ascii=False), encoding="utf-8")

    print("building and clustering...")
    G = build_from_json(extraction, root=str(ROOT), directed=True)
    if G.number_of_nodes() == 0:
        die("extraction produced no nodes.")
    communities = cluster(G)
    cohesion = score_all(G, communities)

    # Re-attach curated names by hub, then let graphify name whatever is left.
    curated = load_curated(G, communities)

    # Score every curated name against every community by membership similarity, then
    # assign from the strongest match down. A name whose best community is taken still
    # gets its next-best, so two names never deadlock over one community.
    scored: list[tuple[float, str, int]] = []
    for name, stored in curated.items():
        for cid, members in communities.items():
            score = similarity(stored, members)
            if score >= MIN_SIMILARITY:
                scored.append((score, name, cid))
    scored.sort(key=lambda t: (-t[0], t[1]))

    labels: dict[int, str] = {}
    placed: set[str] = set()
    for _score, name, cid in scored:
        if cid in labels or name in placed:
            continue
        labels[cid] = name
        placed.add(name)

    missing = {cid: m for cid, m in communities.items() if cid not in labels}
    if missing:
        labels.update(
            {cid: f"{name}{AUTO_SUFFIX}" for cid, name in label_communities_by_hub(G, missing).items()}
        )

    # Re-derive every surviving anchor from where its community actually sits now,
    # so the fingerprint tracks the community instead of ageing in place. Names that
    # found no community are dropped, not carried: a warning that fires on every run
    # teaches the reader to ignore it, and then the one that matters arrives at a
    # habit already formed.
    # Only human-curated names are persisted. Auto names are derived from the graph
    # on every run, so storing them would turn them into anchors and make the next
    # run report them as lost the moment their community shifted.
    orphaned = sorted(set(curated) - placed)
    CURATED.write_text(
        json.dumps(
            {
                name: anchor_of(G, communities[cid])
                for cid, name in labels.items()
                if not name.endswith(AUTO_SUFFIX)
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    gods = god_nodes(G)
    surprises = surprising_connections(G, communities)
    questions = suggest_questions(G, communities, labels)
    tokens = {"input": extraction["input_tokens"], "output": extraction["output_tokens"]}

    if not to_json(G, communities, str(GRAPH), force=True, community_labels=labels):
        die("to_json refused to write the graph.")
    report = generate(
        G, communities, cohesion, labels, gods, surprises, detection, tokens,
        str(ROOT), suggested_questions=questions,
    )
    (OUT / "GRAPH_REPORT.md").write_text(report, encoding="utf-8")

    # Always write the signature sidecar. Without it graphify's own reuse guard
    # falls back to "same community count means unchanged", which is exactly how a
    # curated name ends up describing a community it no longer covers.
    LABELS.write_text(
        json.dumps({str(k): v for k, v in sorted(labels.items())}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    sigs = community_member_sigs(communities)
    SIG.write_text(
        json.dumps({str(k): v for k, v in sorted(sigs.items())}, ensure_ascii=False),
        encoding="utf-8",
    )

    # Regenerate the viewer from the graph we just wrote, so graph.html never shows
    # a different graph from the one on disk. Shelling out to the CLI rather than
    # importing: `graphify export html` is the documented interface and the HTML
    # writer is not exposed as a stable function.
    result = subprocess.run(
        [sys.executable, "-m", "graphify", "export", "html"],
        cwd=ROOT, capture_output=True, text=True,
    )
    if result.returncode == 0:
        print("  graph.html regenerated")
    else:
        print(
            f"  graph.html NOT regenerated; run `graphify export html` manually\n"
            f"  {result.stderr.strip()[:200]}",
            file=sys.stderr,
        )

    origins = Counter(n.get("_origin") for n in json.loads(GRAPH.read_text(encoding="utf-8"))["nodes"])
    now_semantic = sum(v for k, v in origins.items() if k != "ast")
    curated_applied = sum(1 for v in labels.values() if not v.endswith(AUTO_SUFFIX))

    print()
    print(f"nodes        : {G.number_of_nodes()}   edges: {G.number_of_edges()}")
    print(f"communities  : {len(communities)}")
    print(f"_origin      : {dict(origins)}")
    print(f"semantic     : {now_semantic}" + (f"  (was {previous_semantic})" if previous_semantic else ""))
    print(f"curated names: {curated_applied} re-attached by membership, {len(labels) - curated_applied} auto")
    if orphaned:
        print()
        print(f"DROPPED {len(orphaned)} curated name(s) whose hub no longer leads a community:")
        for name in sorted(orphaned):
            print(f"   - {name}")
        print("   Re-curate them if they still matter; they are gone from the anchor file.")
    if previous_semantic and now_semantic < previous_semantic:
        print()
        print(
            f"WARNING: semantic nodes dropped {previous_semantic} -> {now_semantic}. "
            "Check .graphify_semantic.json before trusting this graph.",
            file=sys.stderr,
        )


if __name__ == "__main__":
    main()
