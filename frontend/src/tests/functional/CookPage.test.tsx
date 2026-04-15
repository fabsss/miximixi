import { render, screen, fireEvent } from '@testing-library/react';
import CookPage from '../../../../../frontend/src/pages/CookPage';

describe('CookPage', () => {
    test('renders the CookPage and displays correct information', () => {
        render(<CookPage />);
        expect(screen.getByText(/cook your meal/i)).toBeInTheDocument();
    });

    test('handles user interactions correctly', () => {
        render(<CookPage />);
        const button = screen.getByRole('button', { name: /start cooking/i });
        fireEvent.click(button);
        expect(screen.getByText(/cooking started/i)).toBeInTheDocument();
    });
});