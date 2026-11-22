/**
 * 导航与页面标题共用的文案表。
 *
 * 之前「题库总览」「题夹」「学习档案」在侧栏、移动端底栏和顶栏标题里
 * 各写一遍，改名要改三处。这里只做一份字符串映射，图标与徽标仍由各
 * 自组件决定，避免把布局状态塞进配置表。
 */
export const NAV_LABELS = {
  home: '学习台',
  goals: '目标方案',
  strategy: '练习策略',
  catalog: '题库总览',
  compose: '自定义组卷',
  review: '题夹',
  records: '学习档案',
  settings: '设置',
} as const
