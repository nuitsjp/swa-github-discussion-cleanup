import commonjs from '@rollup/plugin-commonjs'
import nodeResolve from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'

const config = [
  {
    input: 'src/index.ts',
    output: {
      esModule: true,
      file: 'dist/index.js',
      format: 'es',
      sourcemap: true
    },
    plugins: [typescript(), nodeResolve({ preferBuiltins: true }), commonjs()],
    onwarn(warning, warn) {
      if (
        warning.code === 'CIRCULAR_DEPENDENCY' &&
        warning.ids?.some((id) =>
          /[/\\]node_modules[/\\]@actions[/\\]core/.test(id)
        )
      ) {
        return
      }
      warn(warning)
    }
  }
]

export default config
