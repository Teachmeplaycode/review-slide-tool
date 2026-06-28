import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { GradedQuestion } from '../types'
import ResultReview from './ResultReview.vue'

describe('ResultReview', () => {
  it('shows choice options when standard answers are revealed', () => {
    const wrapper = mount(ResultReview, {
      props: {
        result: makeChoiceResult(),
        index: 0,
        showAnswer: true,
      },
    })

    expect(wrapper.text()).toContain('A')
    expect(wrapper.text()).toContain('用户容易参与开发')
    expect(wrapper.text()).toContain('B')
    expect(wrapper.text()).toContain('缺乏灵活性')
    expect(wrapper.text()).toContain('标准答案')
  })

  it('hides choice options when standard answers are hidden', () => {
    const wrapper = mount(ResultReview, {
      props: {
        result: makeChoiceResult(),
        index: 0,
        showAnswer: false,
      },
    })

    expect(wrapper.text()).not.toContain('用户容易参与开发')
    expect(wrapper.text()).toContain('答案已隐藏')
  })
})

function makeChoiceResult(): GradedQuestion {
  return {
    question: {
      id: 'q1',
      type: 'choice',
      sourceType: 'choice',
      stem: '瀑布模型的存在问题是（  ）。',
      options: [
        { label: 'A', text: '用户容易参与开发' },
        { label: 'B', text: '缺乏灵活性' },
      ],
      answer: 'B',
      raw: '',
      confidence: 1,
      warnings: [],
      enabled: true,
    },
    userAnswer: 'A',
    expectedAnswer: 'B',
    score: 0,
    status: 'wrong',
    detail: '选项与标准答案不一致',
  }
}
