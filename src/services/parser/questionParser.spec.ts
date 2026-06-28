import { describe, expect, it } from 'vitest'
import { parseQuestions } from './questionParser'

describe('parseQuestions', () => {
  it('parses numbered choice questions with compact options', () => {
    const questions = parseQuestions(`
1.瀑布模型的存在问题是（  ）。
A.用户容易参与开发B.缺乏灵活性
C.用户与开发者易沟通D.适用可变需求
答案：B
`)

    expect(questions).toHaveLength(1)
    expect(questions[0].type).toBe('choice')
    expect(questions[0].options).toHaveLength(4)
    expect(questions[0].answer).toBe('B')
  })

  it('parses true false questions', () => {
    const questions = parseQuestions(`
1.开发软件就是编写程序。（  ）
答案：×
`)

    expect(questions[0].type).toBe('true_false')
    expect(questions[0].answer).toBe('×')
  })

  it('parses paired blank questions without numbering', () => {
    const questions = parseQuestions(`
瀑布模型是一个    驱动模型。
文档
一般说来，模块之间的耦合程度低则单个模块的内聚程度    。
高
`)

    expect(questions).toHaveLength(2)
    expect(questions[0].type).toBe('blank')
    expect(questions[0].answer).toBe('文档')
  })

  it('parses markdown heading short answer questions', () => {
    const questions = parseQuestions(`
### 1.什么是软件危机?

软件危机是指软件开发和维护过程中效率低、质量难以保障等问题。

### 2.软件生命期各阶段的任务是什么。

可行性研究、需求分析、概要设计、详细设计、编码、测试和维护。
`)

    expect(questions).toHaveLength(2)
    expect(questions[0].type).toBe('short')
    expect(questions[0].answer).toContain('软件开发')
  })

  it('infers unnumbered short answer questions from prompt paragraphs', () => {
    const questions = parseQuestions(`
什么是软件危机?为什么会产生软件危机？
软件危机是指在软件开发与维护过程中遇到的一系列严重问题。
软件生命期各阶段的任务是什么。
软件生命周期分为可行性研究、需求分析、概要设计、详细设计、编码、测试和维护。
`)

    expect(questions).toHaveLength(2)
    expect(questions[1].answer).toContain('概要设计')
  })
})
