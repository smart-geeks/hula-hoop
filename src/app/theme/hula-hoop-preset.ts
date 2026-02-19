import { definePreset, palette } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

const HulaHoopPreset = definePreset(Aura, {
  primitive: {
    // Lima
    lima: palette('#8CE9AF'),
    // Rosa Pastel
    rosaPastel: palette('#EDB2E4'),
    // Azul Cielo
    azulCielo: palette('#85E8E3'),
    // Morado
    morado: palette('#686ABB'),
    // Rojo Brillante
    rojoBrillante: palette('#E30D1C'),
    // Naranja
    naranja: palette('#FC7632'),
    // Marrón
    marron: palette('#B28B7E'),
    // Amarillo Merengue
    amarilloMerengue: palette('#F6F090'),
    // Neutro
    neutro: palette('#F3ECE5'),
  },
  semantic: {
    primary: {
      50: '{rojoBrillante.50}',
      100: '{rojoBrillante.100}',
      200: '{rojoBrillante.200}',
      300: '{rojoBrillante.300}',
      400: '{rojoBrillante.400}',
      500: '{rojoBrillante.500}',
      600: '{rojoBrillante.600}',
      700: '{rojoBrillante.700}',
      800: '{rojoBrillante.800}',
      900: '{rojoBrillante.900}',
      950: '{rojoBrillante.950}',
    },
    colorScheme: {
      light: {
        primary: {
          color: '{rojoBrillante.500}',
          contrastColor: '#ffffff',
          hoverColor: '{rojoBrillante.600}',
          activeColor: '{rojoBrillante.700}',
        },
        surface: {
          0: '#ffffff',
          50: '{neutro.50}',
          100: '{neutro.100}',
          200: '{neutro.200}',
          300: '{neutro.300}',
          400: '{neutro.400}',
          500: '{neutro.500}',
          600: '{neutro.600}',
          700: '{neutro.700}',
          800: '{neutro.800}',
          900: '{neutro.900}',
          950: '{neutro.950}',
        },
        highlight: {
          background: '{rojoBrillante.50}',
          focusBackground: '{rojoBrillante.100}',
          color: '{rojoBrillante.700}',
          focusColor: '{rojoBrillante.800}',
        },
      },
      dark: {
        primary: {
          color: '{rojoBrillante.400}',
          contrastColor: '{surface.900}',
          hoverColor: '{rojoBrillante.300}',
          activeColor: '{rojoBrillante.200}',
        },
        surface: {
          0: '#ffffff',
          50: '{neutro.50}',
          100: '{neutro.100}',
          200: '{neutro.200}',
          300: '{neutro.300}',
          400: '{neutro.400}',
          500: '{neutro.500}',
          600: '{neutro.600}',
          700: '{neutro.700}',
          800: '{neutro.800}',
          900: '{neutro.900}',
          950: '{neutro.950}',
        },
        highlight: {
          background: 'color-mix(in srgb, {rojoBrillante.400}, transparent 84%)',
          focusBackground: 'color-mix(in srgb, {rojoBrillante.400}, transparent 76%)',
          color: 'rgba(255,255,255,.87)',
          focusColor: 'rgba(255,255,255,.87)',
        },
      },
    },
  },
  components: {
    button: {
      colorScheme: {
        light: {
          root: {
            help: {
              background: '{morado.500}',
              hoverBackground: '{morado.600}',
              activeBackground: '{morado.700}',
              borderColor: '{morado.500}',
              hoverBorderColor: '{morado.600}',
              activeBorderColor: '{morado.700}',
              color: '#ffffff',
              hoverColor: '#ffffff',
              activeColor: '#ffffff',
              focusRing: {
                color: '{morado.500}',
                shadow: 'none',
              },
            },
          },
          outlined: {
            help: {
              hoverBackground: '{morado.50}',
              activeBackground: '{morado.100}',
              borderColor: '{morado.200}',
              color: '{morado.500}',
            },
          },
          text: {
            help: {
              hoverBackground: '{morado.50}',
              activeBackground: '{morado.100}',
              color: '{morado.500}',
            },
          },
        },
      },
    },
  },
});

export default HulaHoopPreset;
