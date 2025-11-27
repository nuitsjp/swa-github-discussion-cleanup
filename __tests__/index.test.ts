import { jest } from '@jest/globals'

const infoMock = jest.fn()
const debugMock = jest.fn()
const setOutputMock = jest.fn()
const setFailedMock = jest.fn()
const getInputMock = jest.fn()

jest.unstable_mockModule('@actions/core', () => ({
  getInput: getInputMock,
  setOutput: setOutputMock,
  setFailed: setFailedMock,
  info: infoMock,
  debug: debugMock
}))

jest.unstable_mockModule('@actions/github', () => ({
  context: { repo: { owner: 'ctx-owner', repo: 'ctx-repo' } },
  getOctokit: () => ({})
}))

jest.unstable_mockModule('@octokit/graphql', () => ({
  graphql: {
    defaults: () => jest.fn()
  }
}))

const { createTitleRegex, parseTargetRepo, shouldDeleteDiscussion } =
  await import('../src/index.js')

type DiscussionNode = {
  id: string
  title: string
  createdAt: string
  url: string
}

describe('parseTargetRepo', () => {
  it('parses owner/repo format correctly', () => {
    const result = parseTargetRepo('owner/repo', {
      owner: 'default-owner',
      repo: 'default-repo'
    })
    expect(result).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('returns context repo when input is undefined', () => {
    const result = parseTargetRepo(undefined, {
      owner: 'ctx-owner',
      repo: 'ctx-repo'
    })
    expect(result).toEqual({ owner: 'ctx-owner', repo: 'ctx-repo' })
  })

  it('returns context repo when input is empty string', () => {
    const result = parseTargetRepo('', {
      owner: 'ctx-owner',
      repo: 'ctx-repo'
    })
    expect(result).toEqual({ owner: 'ctx-owner', repo: 'ctx-repo' })
  })

  it('throws error for invalid format without slash', () => {
    expect(() =>
      parseTargetRepo('invalid-format', {
        owner: 'default-owner',
        repo: 'default-repo'
      })
    ).toThrow('Invalid target-repo format: invalid-format')
  })

  it('throws error for format with only owner', () => {
    expect(() =>
      parseTargetRepo('owner/', {
        owner: 'default-owner',
        repo: 'default-repo'
      })
    ).toThrow('Invalid target-repo format: owner/')
  })
})

describe('createTitleRegex', () => {
  it('creates regex that matches default template pattern', () => {
    const regex = createTitleRegex(
      'SWA access invite for @{login} ({swaName}) - {date}'
    )
    expect(
      regex.test('SWA access invite for @alice (my-swa) - 2024-01-02')
    ).toBe(true)
    expect(
      regex.test('SWA access invite for @bob (other-swa) - 2024-12-31')
    ).toBe(true)
  })

  it('does not match unrelated titles', () => {
    const regex = createTitleRegex(
      'SWA access invite for @{login} ({swaName}) - {date}'
    )
    expect(regex.test('Random discussion title')).toBe(false)
    expect(regex.test('SWA access invite for alice')).toBe(false)
  })

  it('escapes special regex characters in template', () => {
    const regex = createTitleRegex('Test (with) [brackets] and {placeholder}?')
    expect(regex.test('Test (with) [brackets] and something?')).toBe(true)
    expect(regex.test('Test with brackets and something')).toBe(false)
  })

  it('handles template with no placeholders', () => {
    const regex = createTitleRegex('Fixed title')
    expect(regex.test('Fixed title')).toBe(true)
    expect(regex.test('Fixed title extra')).toBe(false)
    expect(regex.test('Other title')).toBe(false)
  })
})

describe('shouldDeleteDiscussion', () => {
  const titleRegex = createTitleRegex(
    'SWA access invite for @{login} ({swaName}) - {date}'
  )

  const createDiscussion = (
    title: string,
    createdAt: string
  ): DiscussionNode => ({
    id: 'test-id',
    title,
    createdAt,
    url: 'https://github.com/owner/repo/discussions/1'
  })

  describe('expiration mode', () => {
    it('returns true for expired discussion with matching title', () => {
      const discussion = createDiscussion(
        'SWA access invite for @alice (my-swa) - 2024-01-01',
        '2024-01-01T00:00:00Z'
      )
      const expirationDate = new Date('2024-01-08T00:00:00Z')

      expect(
        shouldDeleteDiscussion(
          discussion,
          titleRegex,
          expirationDate,
          'expiration'
        )
      ).toBe(true)
    })

    it('returns false for non-expired discussion with matching title', () => {
      const discussion = createDiscussion(
        'SWA access invite for @alice (my-swa) - 2024-01-10',
        '2024-01-10T00:00:00Z'
      )
      const expirationDate = new Date('2024-01-08T00:00:00Z')

      expect(
        shouldDeleteDiscussion(
          discussion,
          titleRegex,
          expirationDate,
          'expiration'
        )
      ).toBe(false)
    })

    it('returns false for expired discussion with non-matching title', () => {
      const discussion = createDiscussion(
        'Random discussion',
        '2024-01-01T00:00:00Z'
      )
      const expirationDate = new Date('2024-01-08T00:00:00Z')

      expect(
        shouldDeleteDiscussion(
          discussion,
          titleRegex,
          expirationDate,
          'expiration'
        )
      ).toBe(false)
    })
  })

  describe('immediate mode', () => {
    it('returns true for any matching discussion regardless of age', () => {
      const discussion = createDiscussion(
        'SWA access invite for @alice (my-swa) - 2024-01-10',
        '2024-01-10T00:00:00Z'
      )
      const expirationDate = new Date('2024-01-08T00:00:00Z')

      expect(
        shouldDeleteDiscussion(
          discussion,
          titleRegex,
          expirationDate,
          'immediate'
        )
      ).toBe(true)
    })

    it('returns false for non-matching discussion in immediate mode', () => {
      const discussion = createDiscussion(
        'Random discussion',
        '2024-01-10T00:00:00Z'
      )
      const expirationDate = new Date('2024-01-08T00:00:00Z')

      expect(
        shouldDeleteDiscussion(
          discussion,
          titleRegex,
          expirationDate,
          'immediate'
        )
      ).toBe(false)
    })
  })
})
