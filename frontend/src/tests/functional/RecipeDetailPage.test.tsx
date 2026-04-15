import { render, screen, waitFor } from '@testing-library/react';
import RecipeDetailPage from '../../components/RecipeDetailPage';
import { fetchRecipe } from '../../lib/api';

jest.mock('../../lib/api');

describe('RecipeDetailPage', () => {
    const recipe = { id: 1, title: 'Test Recipe', description: 'This is a test recipe.' };

    beforeEach(() => {
        fetchRecipe.mockResolvedValue(recipe);
    });

    test('fetches and displays the correct recipe details', async () => {
        render(<RecipeDetailPage recipeId={1} />);

        await waitFor(() => expect(fetchRecipe).toHaveBeenCalledWith(1));

        expect(screen.getByText(recipe.title)).toBeInTheDocument();
        expect(screen.getByText(recipe.description)).toBeInTheDocument();
    });
});