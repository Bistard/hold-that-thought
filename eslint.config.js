import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';

export default tseslint.config(
	js.configs.recommended,
	...tseslint.configs.recommended,
	...pluginVue.configs['flat/recommended'],
	{
		rules: {
			// format (Prettier on，ESLint off)
			'vue/html-indent': 'off',

			// format (ESLint)
			curly: ['error', 'all'],
			'brace-style': ['error', '1tbs', { allowSingleLine: false }],

			// common javascript
			'no-console': 'warn',
			'no-empty': 'off',
			'no-constant-condition': 'off',
			'prefer-rest-params': 'off',
			'no-inner-declarations': 'off',
			'no-useless-catch': 'warn',
			eqeqeq: 'error',

			// Vue
			'vue/multi-word-component-names': 'off',

			// TypeScript
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/no-namespace': 'off',
			'@typescript-eslint/ban-ts-comment': 'off',
			'@typescript-eslint/no-unused-vars': 'warn',
			'@typescript-eslint/no-empty-function': 'off',
			'@typescript-eslint/no-empty-object-type': 'off',
		},
	},
	{
		// testing
		files: ['**/*.test.*', '**/*.spec.*'],
		rules: {
			'@typescript-eslint/no-unused-vars': 'off',
			'@typescript-eslint/no-empty-function': 'off',
		},
	},
	{
		files: ['**/*.vue'],
		languageOptions: {
			parserOptions: {
				parser: tseslint.parser,
			},
		},
	},
	{
		ignores: ['**/dist/**', '**/node_modules/**', '**/.worktrees/**'],
	},
);
