import { describe, expect, it } from 'vitest'
import { planDisplayName } from '../src/lib/planDisplay'

describe('planDisplayName', () => {
  it('removes delivery-region suffixes from displayed plan names', () => {
    expect(planDisplayName('G1广电西胜卡19元130G+200分钟【只发江西】')).toBe(
      'G1广电西胜卡19元130G+200分钟',
    )
    expect(planDisplayName('广电晶露卡19元180G+250分钟【仅发上海】')).toBe(
      '广电晶露卡19元180G+250分钟',
    )
    expect(planDisplayName('湖南广电专享卡【19元130G+200分钟】限发湖南')).toBe(
      '湖南广电专享卡【19元130G+200分钟】',
    )
  })

  it('keeps package-detail brackets and trims only the delivery suffix', () => {
    expect(planDisplayName('吉林广电专享卡【19元130G+200分钟】')).toBe(
      '吉林广电专享卡【19元130G+200分钟】',
    )
    expect(planDisplayName('上海广电专属卡4.0【月均20元350G+200分钟】')).toBe(
      '上海广电专属卡4.0【月均20元350G+200分钟】',
    )
  })
})
