import { useEffect, useState } from 'react'
import {
  getDataLayerHealth,
  onDataLayerHealth,
  type DataLayerHealth,
} from '../services/dataLayer'

/** 订阅当前数据层实现，供设置页展示驱动类型与降级提示。 */
export function useDataLayer(): DataLayerHealth {
  const [health, setHealth] = useState<DataLayerHealth>(getDataLayerHealth)

  useEffect(() => onDataLayerHealth(setHealth), [])

  return health
}
