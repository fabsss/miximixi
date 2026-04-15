import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import FeedPage from '../../components/FeedPage';
import { fetchFeedData } from '../../lib/api';

jest.mock('../../lib/api');

describe('FeedPage', () => {
    beforeEach(() => {
        fetchFeedData.mockResolvedValue([{ id: 1, title: 'Test Recipe' }]);
    });

    test('renders feed data correctly', async () => {
        render(<FeedPage />);
        
        await waitFor(() => {
            expect(screen.getByText('Test Recipe')).toBeInTheDocument();
        });
    });

    test('displays loading state initially', () => {
        render(<FeedPage />);
        expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    test('handles fetch error gracefully', async () => {
        fetchFeedData.mockRejectedValue(new Error('Fetch error'));
        render(<FeedPage />);
        
        await waitFor(() => {
            expect(screen.getByText('Error loading feed')).toBeInTheDocument();
        });
    });
});