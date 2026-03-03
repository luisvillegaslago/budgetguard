-- BudgetGuard Seed Data
-- Initial categories based on typical family expense/income patterns

USE BudgetGuard;
GO

-- Clear existing data (for development only)
-- DELETE FROM Transactions;
-- DELETE FROM Categories;
-- DBCC CHECKIDENT ('Categories', RESEED, 0);
-- DBCC CHECKIDENT ('Transactions', RESEED, 0);

-- Income Categories (guard-success green: #10B981)
INSERT INTO Categories (Name, Type, Icon, Color, SortOrder) VALUES
('Nomina', 'income', 'banknote', '#10B981', 1),
('Reembolsos', 'income', 'receipt', '#34D399', 2),
('Otros Ingresos', 'income', 'plus-circle', '#6EE7B7', 3);

-- Expense Categories (various colors from warm to cool)
INSERT INTO Categories (Name, Type, Icon, Color, SortOrder) VALUES
('Vivienda', 'expense', 'home', '#EF4444', 1),
('Blanquita', 'expense', 'dog', '#F97316', 2),
('Trabajo', 'expense', 'briefcase', '#F59E0B', 3),
('Deporte', 'expense', 'dumbbell', '#EAB308', 4),
('Paracaidismo', 'expense', 'cloud', '#84CC16', 5),
('Supermercado', 'expense', 'shopping-cart', '#22C55E', 6),
('Transporte', 'expense', 'car', '#14B8A6', 7),
('Restaurante', 'expense', 'utensils', '#06B6D4', 8),
('Compras', 'expense', 'shopping-bag', '#0EA5E9', 9),
('Salir', 'expense', 'beer', '#3B82F6', 10),
('Gastos Extra', 'expense', 'alert-circle', '#6366F1', 11),
('Viajes', 'expense', 'plane', '#8B5CF6', 12),
('Anuales', 'expense', 'calendar', '#A855F7', 13);

GO

-- Sample transactions for testing (optional - remove in production)
-- Uncomment to add test data

/*
DECLARE @CurrentMonth DATE = DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1);

-- Sample income
INSERT INTO Transactions (CategoryID, AmountCents, Description, TransactionDate, Type) VALUES
(1, 285000, 'Nomina Enero', DATEADD(DAY, 14, @CurrentMonth), 'income'),
(2, 15000, 'Reembolso medico', DATEADD(DAY, 8, @CurrentMonth), 'income');

-- Sample expenses
INSERT INTO Transactions (CategoryID, AmountCents, Description, TransactionDate, Type) VALUES
(4, 80000, 'Alquiler', DATEADD(DAY, 1, @CurrentMonth), 'expense'),
(7, 12500, 'Carniceria La Buena', DATEADD(DAY, 3, @CurrentMonth), 'expense'),
(7, 8745, 'Mercadona', DATEADD(DAY, 7, @CurrentMonth), 'expense'),
(8, 4500, 'Gasolina', DATEADD(DAY, 5, @CurrentMonth), 'expense'),
(9, 3280, 'Restaurante italiano', DATEADD(DAY, 10, @CurrentMonth), 'expense'),
(11, 2100, 'Netflix + Spotify', DATEADD(DAY, 1, @CurrentMonth), 'expense');
*/
