import React from 'react';
import { render, screen } from '@testing-library/react';
import AppLayout from '../../../components/AppLayout';

describe('AppLayout', () => {
    test('renders AppLayout component', () => {
        render(<AppLayout />);
        const linkElement = screen.getByText(/some text in AppLayout/i);
        expect(linkElement).toBeInTheDocument();
    });

    test('checks functionality of a button in AppLayout', () => {
        render(<AppLayout />);
        const buttonElement = screen.getByRole('button', { name: /click me/i });
        expect(buttonElement).toBeInTheDocument();
        buttonElement.click();
        expect(screen.getByText(/button clicked/i)).toBeInTheDocument();
    });
});