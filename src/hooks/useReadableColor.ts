// https://stackoverflow.com/questions/6443990/javascript-calculate-brighter-colour
// https://stackoverflow.com/questions/9733288/how-to-programmatically-calculate-the-contrast-ratio-between-two-colors

import { useTheme } from "@mui/material/styles";
import { useContext, useRef } from "react";
import { UserColorContext } from "../context/ChatContext";
import { useGlobalSettingContext } from "../context/GlobalSetting";

/**
 * Converts an RGB color value to HSL. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes r, g, and b are contained in the set [0, 255] and
 * returns h, s, and l in the set [0, 1].
 *
 * @param   Number  r       The red color value
 * @param   Number  g       The green color value
 * @param   Number  b       The blue color value
 * @return  Array           The HSL representation
 */
export function rgbToHsl(r: number, g: number, b: number) {
  r /= 255;
  g /= 255;
  b /= 255;
  let max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h = 0;
  let s,
    l = (max + min) / 2;

  if (max == min) {
    h = s = 0; // achromatic
  } else {
    let d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return [h, s, l];
}

function hue2rgb(p: number, q: number, t: number) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}
/**
 * Converts an HSL color value to RGB. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes h, s, and l are contained in the set [0, 1] and
 * returns r, g, and b in the set [0, 255].
 *
 * @param   Number  h       The hue
 * @param   Number  s       The saturation
 * @param   Number  l       The lightness
 * @return  Array           The RGB representation
 */
export function hslToRgb(h: number, s: number, l: number) {
  let r, g, b;

  if (s == 0) {
    r = g = b = l; // achromatic
  } else {
    let q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    let p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return [r * 255, g * 255, b * 255];
}

export function getNewBrightnessColor(rgbcode: string, brightness: number) {
  let hex = convertHexCodeToDecArray(rgbcode),
    HSL = rgbToHsl(hex[0], hex[1], hex[2]),
    RGB;

  RGB = hslToRgb(HSL[0], HSL[1], brightness / 100);
  rgbcode =
    "#" +
    convertToTwoDigitHexCodeFromDecimal(RGB[0]) +
    convertToTwoDigitHexCodeFromDecimal(RGB[1]) +
    convertToTwoDigitHexCodeFromDecimal(RGB[2]);

  return rgbcode;
}

export function useReadableColor(username: string, color?: string) {
  const { globalSetting } = useGlobalSettingContext();

  const userColorContext = useContext(UserColorContext);
  const targetContrast = useRef(4.0);
  const bgColor = useTheme().colors.remoteBgColor;

  const getColor = () => {
    let _color = resolveColor(userColorContext.current, username, color);
    const isDarkTheme = globalSetting.darkTheme === "on";
    const ctr = contrast(_color, bgColor);

    if (ctr <= 4.0) {
      const rgb = convertHexCodeToDecArray(_color);
      const hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);

      let light = Math.floor(hsl[2] * 100);

      if (isDarkTheme) {
        for (let i = 0; i < 10; i++) {
          light = light + 9 + (targetContrast.current - ctr);
          _color = getNewBrightnessColor(_color, light);
          if (contrast(_color, bgColor) >= 4.0) break;
        }
      } else {
        for (let i = 0; i < 10; i++) {
          light = light - 9 + (targetContrast.current - ctr);
          _color = getNewBrightnessColor(_color, light);
          if (contrast(_color, bgColor) >= 4.0) break;
        }
      }
    }
    return _color;
  };

  return { getColor };
}

const color_list = [
  "#FF0000",
  "#0000FF",
  "#008000",
  "#B22222",
  "#FF7F50",
  "#9ACD32",
  "#FF4500",
  "#2E8B57",
  "#DAA520",
  "#D2691E",
  "#5F9EA0",
  "#1E90FF",
  "#FF69B4",
  "#8A2BE2",
  "#00FF7F",
];

export function resolveColor(
  colorMap: Map<string, string>,
  name: string,
  color?: string
) {
  let resolvedColor = colorMap.get(name);

  if (resolvedColor) {
    if (color && resolvedColor !== color) {
      resolvedColor = color;
      colorMap.set(name, resolvedColor);
    }
  } else {
    if (!color) {
      const rndIdx = Math.floor(Math.random() * color_list.length);
      color = color_list[rndIdx];
    }
    colorMap.set(name, color);
    resolvedColor = color;
  }
  return resolvedColor;
}

function convertToTwoDigitHexCodeFromDecimal(decimal: number) {
  var code = Math.round(decimal).toString(16);

  code.length > 1 || (code = "0" + code);
  return code;
}
export function convertHexCodeToDecArray(hex: string) {
  let r = parseInt(hex.slice(1, 3), 16),
    g = parseInt(hex.slice(3, 5), 16),
    b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function luminance(r: number, g: number, b: number) {
  var a = [r, g, b].map(function (v) {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

export function contrast(rgb1: string, rgb2: string) {
  let hex1 = convertHexCodeToDecArray(rgb1);
  let hex2 = convertHexCodeToDecArray(rgb2);

  let lum1 = luminance(hex1[0], hex1[1], hex1[2]);
  let lum2 = luminance(hex2[0], hex2[1], hex2[2]);
  let brightest = Math.max(lum1, lum2);
  let darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}
