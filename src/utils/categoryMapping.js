// arXiv 分类到显示名称的映射（五个固定分类）
const categoryMapping = {
  'cs.AI': 'Artificial Intelligence (cs.AI)',
  'cs.CL': 'Computation and Language (cs.CL)',
  'cs.CV': 'Computer Vision and Pattern Recognition (cs.CV)',
  'cs.LG': 'Machine Learning (cs.LG)',
  'other': 'Other'
}

/**
 * 将详细分类映射到五个固定分类之一
 * @param {string} category - arXiv 分类代码（如 'cs.AI' 或 'cs.LG'）
 * @returns {string} 分类标识 ('cs.AI', 'cs.CL', 'cs.CV', 'cs.LG', 'other')
 */
export function getMainCategory(category) {
  if (!category) return 'other'
  
  const trimmed = category.trim()
  
  // 精确匹配四个主要分类
  if (trimmed === 'cs.AI' || trimmed.startsWith('cs.AI')) {
    return 'cs.AI'
  }
  if (trimmed === 'cs.CL' || trimmed.startsWith('cs.CL')) {
    return 'cs.CL'
  }
  if (trimmed === 'cs.CV' || trimmed.startsWith('cs.CV')) {
    return 'cs.CV'
  }
  if (trimmed === 'cs.LG' || trimmed.startsWith('cs.LG')) {
    return 'cs.LG'
  }
  
  // 其他所有分类都归为 'other'
  return 'other'
}

/**
 * 获取分类的显示名称
 * @param {string} category - arXiv 分类代码
 * @returns {string} 分类显示名称
 */
export function getCategoryDisplayName(category) {
  if (!category) return categoryMapping['other']
  const mainCategory = getMainCategory(category)
  return categoryMapping[mainCategory] || categoryMapping['other']
}

/**
 * 获取所有分类的显示名称
 * @param {string} categories - 逗号分隔的分类字符串（如 'cs.AI, cs.LG'）
 * @returns {string} 格式化后的分类显示名称
 */
export function getCategoriesDisplayName(categories) {
  if (!categories) return ''
  
  // 去重并映射到五个固定分类
  const categorySet = new Set()
  categories.split(',').forEach(cat => {
    const mainCat = getMainCategory(cat.trim())
    categorySet.add(mainCat)
  })
  
  return Array.from(categorySet)
    .map(cat => categoryMapping[cat] || categoryMapping['other'])
    .join(', ')
}

/**
 * 获取所有可用的分类列表（用于分类筛选按钮）
 * @returns {Array} 分类标识列表
 */
export function getAllCategories() {
  return ['cs.AI', 'cs.CL', 'cs.CV', 'cs.LG', 'other']
}

// 别名，保持向后兼容
export const getCategoriesDisplayNames = getCategoriesDisplayName
