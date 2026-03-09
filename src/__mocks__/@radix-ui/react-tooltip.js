/**
 * Mock for @radix-ui/react-tooltip in test environment
 * Renders children directly without requiring TooltipProvider
 */
const React = require('react');

const Provider = ({ children }) => React.createElement(React.Fragment, null, children);
const Root = ({ children }) => React.createElement(React.Fragment, null, children);
const Trigger = React.forwardRef(({ children, asChild, ...props }, ref) => {
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, { ...props, ref });
  }
  return React.createElement('span', { ...props, ref }, children);
});
Trigger.displayName = 'TooltipTrigger';
const Portal = () => null;
const Content = () => null;
const Arrow = () => null;

module.exports = { Provider, Root, Trigger, Portal, Content, Arrow };
