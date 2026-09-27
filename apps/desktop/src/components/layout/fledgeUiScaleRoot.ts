/** タイトルバー以外の UI を乗せるルート（CSS zoom 対象）。ポータル先にも使う。 */
export const FLEDGE_UI_SCALE_ROOT_ID = 'fledge-ui-scale-root'

export function getFledgeUiScaleRoot(): HTMLElement {
  if (typeof document === 'undefined') {
    throw new Error('getFledgeUiScaleRoot requires document')
  }
  return document.getElementById(FLEDGE_UI_SCALE_ROOT_ID) ?? document.body
}
