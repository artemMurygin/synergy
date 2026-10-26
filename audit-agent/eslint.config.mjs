// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettier from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: ['dist/**', 'node_modules/**', 'src/generated/**', 'eslint.config.mjs'],
    },
    eslint.configs.recommended,
    // Строгие правила на основе информации о типах (+ стилистические, тоже типизированные)
    ...tseslint.configs.strictTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
    eslintPluginPrettier,
    {
        languageOptions: {
            globals: { ...globals.node },
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/explicit-function-return-type': [
                'error',
                { allowExpressions: true, allowTypedFunctionExpressions: true },
            ],
            '@typescript-eslint/explicit-member-accessibility': [
                'error',
                { accessibility: 'no-public' },
            ],
            '@typescript-eslint/consistent-type-imports': [
                'error',
                // NestJS DI опирается на emitDecoratorMetadata — импорты классов нельзя делать type-only
                { fixStyle: 'inline-type-imports', prefer: 'type-imports' },
            ],
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-misused-promises': 'error',
            '@typescript-eslint/switch-exhaustiveness-check': 'error',
            '@typescript-eslint/strict-boolean-expressions': 'error',
            '@typescript-eslint/no-unnecessary-condition': 'error',
            '@typescript-eslint/no-non-null-assertion': 'error',
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
            ],
            // NestJS: классы-модули/DTO без членов и параметры конструктора как DI
            '@typescript-eslint/no-extraneous-class': [
                'error',
                { allowWithDecorator: true },
            ],
            '@typescript-eslint/parameter-properties': 'off',
        },
    },
);
