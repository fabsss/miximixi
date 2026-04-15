import { themeFunction } from '../../../utils/theme';

describe('Theme Utility Functions', () => {
    test('should return correct theme for light mode', () => {
        const result = themeFunction('light');
        expect(result).toEqual({ background: '#ffffff', color: '#000000' });
    });

    test('should return correct theme for dark mode', () => {
        const result = themeFunction('dark');
        expect(result).toEqual({ background: '#000000', color: '#ffffff' });
    });

    test('should return default theme for invalid mode', () => {
        const result = themeFunction('invalid');
        expect(result).toEqual({ background: '#f0f0f0', color: '#333333' });
    });
});