// 172号卡API接口
import crypto from 'crypto'

const BASE_URL = 'https://haokaopenapi.lot-ml.com'

export interface Api172Config {
  user_id: string
  secret: string
}

// 生成签名（按文档要求：参数自然排序 + secret）
function generateSign(params: Record<string, string>, secret: string): string {
  // 按key自然排序
  const sortedKeys = Object.keys(params).sort()
  let str = ''
  for (const key of sortedKeys) {
    if (params[key] !== undefined && params[key] !== null) {
      str += `${key}=${params[key]}&`
    }
  }
  str += `secret=${secret}`

  // MD5加密，32位小写
  const sign = crypto.createHash('md5').update(str, 'utf8').digest('hex')
  return sign
}

// 获取10位时间戳
function getTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString()
}

// 通用请求方法
async function request(path: string, params: Record<string, string>, config: Api172Config): Promise<any> {
  const timestamp = getTimestamp()

  // 添加公共参数（不包含 user_sign）
  const allParams: Record<string, string> = {
    user_id: config.user_id,
    Timestamp: timestamp,
    ...params,
  }

  // 生成签名
  const user_sign = generateSign(allParams, config.secret)

  // 构建 form-data（包含签名）
  const formData = new URLSearchParams()
  for (const [key, value] of Object.entries(allParams)) {
    formData.append(key, value)
  }
  formData.append('user_sign', user_sign)

  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
  })

  const result = await response.json()
  return result
}

// 查询订单信息
export async function getOrderInfo(orderId: string, config: Api172Config) {
  return request('/api/order/GetOrderInfo', {
    DownOrderID: orderId,
  }, config)
}

// 查询产品列表
export async function getProducts(config: Api172Config, productId?: string) {
  const params: Record<string, string> = {}
  if (productId) {
    params.ProductID = productId
  }
  return request('/api/order/GetProductsV2', params, config)
}

// 测试连接
export async function testConnection(config: Api172Config): Promise<{ success: boolean; message: string }> {
  try {
    const result = await getProducts(config)
    if (result.code === 0) {
      return { success: true, message: `连接成功！共 ${result.data?.length || 0} 个产品` }
    } else {
      return { success: false, message: `API返回错误: ${result.message || '未知错误'}` }
    }
  } catch (error: any) {
    return { success: false, message: `连接失败: ${error.message}` }
  }
}
