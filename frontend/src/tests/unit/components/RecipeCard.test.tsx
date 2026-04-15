import React from 'react';
import { render, screen } from '@testing-library/react';
import RecipeCard from '../../../components/RecipeCard';

describe('RecipeCard', () => {
    const mockRecipe = {
        title: 'Test Recipe',
        description: 'This is a test recipe description.',
        imageUrl: 'http://example.com/image.jpg',
    };

    test('renders RecipeCard correctly', () => {
        render(<RecipeCard recipe={mockRecipe} />);
        expect(screen.getByText(mockRecipe.title)).toBeInTheDocument();
        expect(screen.getByText(mockRecipe.description)).toBeInTheDocument();
        expect(screen.getByRole('img')).toHaveAttribute('src', mockRecipe.imageUrl);
    });

    test('displays placeholder when no recipe is provided', () => {
        render(<RecipeCard recipe={null} />);
        expect(screen.getByText('No recipe available')).toBeInTheDocument();
    });
});