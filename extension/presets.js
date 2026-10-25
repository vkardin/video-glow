// Пресеты: набор значений «вида» (свечение + фильтры видео), который применяется одним нажатием.
// Встроенные можно менять (хранятся только отличия — presetOverrides), свои лежат в userPresets.
(() => {
  const D = self.VG_DEFAULTS;
  const U = (v) => ({ unit: v });

  // Что входит в пресет: key, тип и границы (для редактора в настройках).
  const PARAMS = [
    { group: 'glow', key: 'shape', type: 'enum', label: 'p_shape',
      opts: [['rect', 'p_shape_rect'], ['rounded', 'p_shape_rounded'], ['circle', 'p_shape_circle']] },
    { group: 'glow', key: 'spread', type: 'range', label: 's_spread', min: 0, max: 60, step: 1, unit: '%' },
    { group: 'glow', key: 'radius', type: 'range', label: 's_radius', min: 0, max: 50, step: 1, unit: '%' },
    { group: 'glow', key: 'feather', type: 'range', label: 's_feather', min: 0, max: 100, step: 1, unit: '%' },
    { group: 'glow', key: 'blur', type: 'range', label: 's_blur', min: 0, max: 120, step: 1, unit: ' px' },
    { group: 'glow', key: 'opacity', type: 'range', label: 's_opacity', min: 0, max: 100, step: 1, unit: '%' },
    { group: 'glow', key: 'saturation', type: 'range', label: 's_saturation', min: 0, max: 250, step: 5, unit: '%' },
    { group: 'glow', key: 'brightness', type: 'range', label: 's_brightness', min: 40, max: 200, step: 5, unit: '%' },
    { group: 'glow', key: 'sample', type: 'range', label: 's_sample', min: 8, max: 256, step: 8, unit: ' px' },
    { group: 'glow', key: 'calm', type: 'range', label: 's_calm', min: 0, max: 100, step: 5, unit: '%' },
    { group: 'glow', key: 'fadeMs', type: 'range', label: 's_fade', min: 0, max: 3000, step: 50, unit: ' ms' },
    { group: 'glow', key: 'seamless', type: 'bool', label: 'p_seamless' },
    { group: 'page', key: 'pageMode', type: 'enum', label: 'p_mode',
      opts: [['screen', 'p_mode_screen'], ['normal', 'p_mode_normal'], ['under', 'p_mode_under']] },
    { group: 'page', key: 'dim', type: 'bool', label: 'p_dim' },
    { group: 'page', key: 'dimLevel', type: 'range', label: 's_dim', min: 10, max: 95, step: 5, unit: '%' },
    { group: 'fx', key: 'fxOn', type: 'bool', label: 'p_fx' },
    { group: 'fx', key: 'fxBrightness', type: 'range', label: 's_fx_brightness', min: 40, max: 200, step: 5, unit: '%' },
    { group: 'fx', key: 'fxContrast', type: 'range', label: 's_fx_contrast', min: 40, max: 200, step: 5, unit: '%' },
    { group: 'fx', key: 'fxSaturation', type: 'range', label: 's_fx_saturation', min: 0, max: 250, step: 5, unit: '%' },
    { group: 'fx', key: 'fxSharp', type: 'range', label: 's_fx_sharp', min: 0, max: 100, step: 5, unit: '' },
    { group: 'fx', key: 'fxWarmth', type: 'range', label: 's_fx_warmth', min: -100, max: 100, step: 5, unit: '' },
    { group: 'fx', key: 'fxGamma', type: 'range', label: 's_fx_gamma', min: 50, max: 200, step: 5, unit: '%' },
    { group: 'scene', key: 'scene', type: 'bool', label: 'p_scene' },
    { group: 'scene', key: 'sceneAmount', type: 'range', label: 's_scene', min: 10, max: 100, step: 5, unit: '%' },
    { group: 'scene', key: 'colorCurve', type: 'enum', label: 'p_curve',
      opts: [['normal', 'p_curve_normal'], ['soft', 'p_curve_soft'], ['cinema', 'p_curve_cinema'], ['sharp', 'p_curve_sharp']] },
    { group: 'scene', key: 'pulse', type: 'bool', label: 'p_pulse' }
  ];
  const KEYS = PARAMS.map((p) => p.key);

  const BASE = {};
  KEYS.forEach((k) => { BASE[k] = D[k]; });
  Object.assign(BASE, { fxOn: false, fxBrightness: 100, fxContrast: 100, fxSaturation: 100,
    fxSharp: 0, fxWarmth: 0, fxGamma: 100, dim: false, calm: 0 });

  // id, ключ названия, отличия от базы
  const BUILTIN = [
    { id: 'soft', name: 'preset_soft', diff: { spread: 22, feather: 80, blur: 50, opacity: 70, saturation: 110, radius: 30 } },
    { id: 'cinema', name: 'preset_cinema', diff: { spread: 14, feather: 60, blur: 36, opacity: 85, saturation: 115, radius: 22,
      fxOn: true, fxContrast: 112, fxSaturation: 108, fxWarmth: 12, fxGamma: 95, fxSharp: 15, dim: true, dimLevel: 55,
      scene: true, sceneAmount: 60, colorCurve: 'cinema' } },
    // Жанровые (1.3.0)
    { id: 'anime', name: 'preset_anime', diff: { spread: 20, feather: 55, blur: 30, opacity: 90, saturation: 150, brightness: 110, radius: 26,
      fxOn: true, fxSaturation: 115, fxContrast: 106, fxSharp: 20, scene: true, sceneAmount: 50, colorCurve: 'cinema' } },
    { id: 'games', name: 'preset_games', diff: { spread: 22, feather: 50, blur: 28, opacity: 95, saturation: 140, brightness: 115, radius: 18,
      fxOn: true, fxContrast: 110, fxSaturation: 112, fxSharp: 20, scene: true, sceneAmount: 70, colorCurve: 'sharp' } },
    { id: 'sport', name: 'preset_sport', diff: { spread: 16, feather: 60, blur: 34, opacity: 85, saturation: 120, brightness: 105, radius: 20,
      fxOn: true, fxSharp: 30, fxContrast: 106, fxSaturation: 110, scene: false, colorCurve: 'soft' } },
    { id: 'music', name: 'preset_music', diff: { spread: 28, feather: 45, blur: 40, opacity: 100, saturation: 180, brightness: 120, radius: 40,
      scene: true, sceneAmount: 80, colorCurve: 'sharp', pulse: true } },
    { id: 'neon', name: 'preset_neon', diff: { spread: 26, feather: 40, blur: 24, opacity: 100, saturation: 190, brightness: 120, radius: 40,
      fxOn: true, fxContrast: 118, fxSaturation: 140, fxSharp: 25 } },
    { id: 'exact', name: 'preset_exact', diff: { spread: 12, feather: 70, blur: 30, opacity: 90, saturation: 100, shape: 'rect', radius: 0 } },
    { id: 'clarity', name: 'preset_clarity', diff: { spread: 16, feather: 60, blur: 34, opacity: 80, saturation: 105, radius: 24,
      fxOn: true, fxSharp: 40, fxContrast: 110, fxSaturation: 105 } },
    { id: 'night', name: 'preset_night', diff: { spread: 18, feather: 75, blur: 60, opacity: 55, brightness: 80, calm: 60, radius: 28,
      fxOn: true, fxWarmth: 45, fxBrightness: 92, dim: true, dimLevel: 70 } }
  ];

  const pick = (src) => {
    const o = {};
    KEYS.forEach((k) => { if (src && k in src) o[k] = src[k]; });
    return o;
  };

  // Полный список для показа: встроенные (с учётом правок) + свои.
  function list(raw) {
    const ov = raw && raw.presetOverrides && typeof raw.presetOverrides === 'object' ? raw.presetOverrides : {};
    const out = BUILTIN.map((b) => ({
      id: b.id, nameKey: b.name, builtin: true, overridden: !!ov[b.id],
      values: Object.assign({}, BASE, b.diff, pick(ov[b.id]))
    }));
    const users = raw && Array.isArray(raw.userPresets) ? raw.userPresets : [];
    users.forEach((u) => {
      if (!u || !u.id) return;
      out.push({ id: u.id, name: String(u.name || '').slice(0, 40), builtin: false, values: Object.assign({}, BASE, pick(u.values)) });
    });
    return out;
  }

  const defaultsOf = (id) => {
    const b = BUILTIN.find((x) => x.id === id);
    return b ? Object.assign({}, BASE, b.diff) : null;
  };
  const snapshot = (src) => pick(Object.assign({}, BASE, src));
  const newId = () => 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  self.VG_presets = { PARAMS, KEYS, BASE, BUILTIN, list, defaultsOf, snapshot, newId };
})();
