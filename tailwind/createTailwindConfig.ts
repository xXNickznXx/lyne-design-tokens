/* eslint-disable @typescript-eslint/no-explicit-any */
import { Format, TransformedToken } from 'style-dictionary/types';
import * as SBBTokens from '../designTokens/index.js';
import { Config } from 'tailwindcss';

type SbbTokens = typeof SBBTokens.default;

export const tailwindFormat: Format = {
  format: ({ dictionary }) => createTailwindConfig(dictionary.allTokens),
  name: 'custom/format/tailwind',
};

export function createTailwindConfig(tokens: TransformedToken[]) {
  const sbbTokens = unnestTokens(tokens);

  // the design tokens contain for some colors a light and dark variant.
  // example: --sbb-color-sky-[theme] -> --sbb-color-sky-light
  // for these colors we want the theme aware variants:
  // --sbb-color-sky
  // which are defined in "composed-variables.css"
  const colors = Object.entries<string>(sbbTokens.color).reduce(
    (prev, [color, value]) =>
      // ignore dark variant
      color.endsWith('Dark')
        ? prev
        : color.endsWith('Light')
          ? // remove the "light" suffix
            { ...prev, [color.replace('Light', '')]: value.replace('-light', '') }
          : { ...prev, [color]: value },
    {},
  );

  const breakpoints = Object.entries<Record<string, any>>(sbbTokens.breakpoint).reduce(
    (curr, [breakpoint, { min, max }]) => {
      return {
        ...curr,
        [breakpoint]: min,
        [`max-${breakpoint}`]: { max },
      };
    },
    {},
  );

  const { fixed: fixedSpacing, responsive } = sbbTokens.spacing;
  // the design tokens contain the spacings for specific breakpoints.
  // this is because the spacings depend on breakpoints.
  // example: --sbb-spacing-responsive-[size]-[breakpoint] -> --sbb-spacing-responsive-xxl-zero
  // for these spacings we want the breakpoint aware variants:
  // --sbb-spacing-responsive-xxl
  // which are defined in "composed-variables.css"
  const responsiveSpacing = Object.entries<Record<string, any>>(responsive).reduce(
    (curr, [size, { zero }]) => ({
      ...curr,
      [size]: zero.replace('-zero', ''),
    }),
    {},
  );

  // the design tokens contain specific font sizes.
  // but we want to use breakpoint aware font sizes.
  // which are defined in "composed-variables.css"
  const headingFontSizes = [1, 2, 3, 4, 5, 6].reduce(
    (prev, heading) => ({
      ...prev,
      [`h${heading}`]: `var(--sbb-heading-font-size-${heading})`,
    }),
    {},
  );
  const textFontSizes = ['xxs', 'xs', 's', 'm', 'l', 'xl'].reduce(
    (prev, size) => ({
      ...prev,
      [size]: `var(--sbb-text-font-size-${size})`,
    }),
    {},
  );

  // the design tokens only contain x, y, blur and spread of the shadow.
  // this is because the colors depend on the theme.
  // because of this we just use the level to get the correct shadows
  // which are defined in "composed-variables.css"
  const boxShadows = Object.entries<Record<string, any>>(sbbTokens.shadow.elevation.level).reduce(
    (prev, [level]) => ({
      ...prev,
      [`${level}s`]: `var(--sbb-box-shadow-level-${level}-soft)`,
      [`${level}h`]: `var(--sbb-box-shadow-level-${level}-hard)`,
    }),
    {},
  );
  const defaultBoxShadow = Object.values(boxShadows)[0];

  const dropShadows = Object.entries<Record<string, any>>(sbbTokens.shadow.elevation.level).reduce(
    (prev, [level, { shadow }]) => {
      function getShadowDefinition(number: number, type: 'soft' | 'hard') {
        return `${shadow[number].offset.x} ${shadow[number].offset.y} ${shadow[number].blur} var(--sbb-shadow-color-${type}-${number})`;
      }

      return {
        ...prev,
        [`${level}s`]: [getShadowDefinition(1, 'soft'), getShadowDefinition(2, 'soft')],
        [`${level}h`]: [getShadowDefinition(1, 'hard'), getShadowDefinition(2, 'hard')],
      };
    },
    {},
  );
  const defaultDropShadow = Object.values(dropShadows)[0];

  const tailwindConfig: Partial<Config> = {
    theme: {
      colors: { transparent: 'transparent', current: 'currentColor', ...colors },
      screens: breakpoints,
      transitionDuration: sbbTokens.animation.duration,
      transitionTimingFunction: { x: sbbTokens.animation.easing },
      borderRadius: withZero({ ...sbbTokens.border.radius, full: '9999px' }),
      borderWidth: withZero(sbbTokens.border.width),
      outlineOffset: withDefault(sbbTokens.focus.outline.offset),
      spacing: withZero({ ...fixedSpacing, ...responsiveSpacing }),
      letterSpacing: sbbTokens.typo.letterSpacing,
      lineHeight: sbbTokens.typo.lineHeight,
      fontFamily: withDefault(sbbTokens.typo.fontFamily),
      fontSize: { ...headingFontSizes, ...textFontSizes },
      boxShadow: withDefault(defaultBoxShadow, boxShadows),
      dropShadow: withDefault(defaultDropShadow, dropShadows),
    },
  };
  return JSON.stringify(tailwindConfig, null, 2);
}

const withDefault = <T extends object, V>(defaultValue: V, obj = {} as T) => ({
  ...obj,
  DEFAULT: defaultValue,
});

const withZero = <T extends object>(obj = {} as T) => ({
  ...obj,
  0: '0',
});

// this type recursively unnests objects that have a "value" property
// e.g. recursively transforms objects like { a: { value: "b" } } to { a: "b" }
type UnnestValue<T> = {
  [K in keyof T]: T[K] extends { value: any } ? T[K]['value'] : UnnestValue<T[K]>;
};

function unnestTokens(tokens: TransformedToken[]): UnnestValue<SbbTokens> {
  const nestedObject: any = {};

  for (const token of tokens) {
    let currentObject = nestedObject;
    const path = token.path;

    // loop over path array
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];

      // if the key does not exist already, add it
      if (!(key in currentObject)) {
        currentObject[key] = {};
      }

      // go to the key with the path name
      currentObject = currentObject[key];
    }

    const finalKey = path.at(-1)!;

    currentObject[finalKey] =
      path[0] === 'breakpoint'
        ? // breakpoints don't support css variables, we need to use the actual value of the variable instead
          `${token.value} /* var(--${token.name}) */`
        : // add the actual value behind the variable as a comment for a better developer experience
          `var(--${token.name}) /* ${token.type === 'dimension' ? token.original.value : token.value} */`;
  }

  return nestedObject;
}
