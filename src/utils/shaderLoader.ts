import noiseGLSL from '../shaders/utils/noise.glsl?raw';

const includes: Record<string, string> = {
    'noise': noiseGLSL,
};

/**
 * Resolves #include <name> directives in GLSL source code.
 * @param source The GLSL source string.
 * @returns The resolved GLSL source string.
 */
export function resolveIncludes(source: string): string {
    return source.replace(/#include\s+<([\w/.-]+)>/g, (_, name) => {
        if (includes[name]) {
            return includes[name];
        }
        console.warn(`Shader include <${name}> not found.`);
        return `// Error: include <${name}> not found`;
    });
}
