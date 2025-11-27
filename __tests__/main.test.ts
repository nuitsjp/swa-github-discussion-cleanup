import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  afterEach
} from '@jest/globals'

const inputs = new Map<string, string>()

const infoMock = jest.fn<(message: string) => void>()
const debugMock = jest.fn<(message: string) => void>()
const setOutputMock = jest.fn<(name: string, value: unknown) => void>()
const setFailedMock = jest.fn<(message: string) => void>()
const getInputValue = (
  name: string,
  options?: { required?: boolean }
): string => {
  const value = inputs.get(name) ?? ''
  if (!value && options?.required) {
    throw new Error(`Input required and not supplied: ${name}`)
  }
  return value
}
const getInputMock = jest.fn(getInputValue)

const graphqlMock = jest.fn<(...args: unknown[]) => Promise<unknown>>()
const deleteGraphqlMock = jest.fn<(...args: unknown[]) => Promise<unknown>>()

async function loadModule() {
  jest.resetModules()

  getInputMock.mockImplementation(getInputValue)

  jest.unstable_mockModule('@actions/core', () => ({
    getInput: getInputMock,
    setOutput: setOutputMock,
    setFailed: setFailedMock,
    info: infoMock,
    debug: debugMock
  }))

  jest.unstable_mockModule('@actions/github', () => ({
    context: { repo: { owner: 'ctx-owner', repo: 'ctx-repo' } },
    getOctokit: () => ({
      graphql: graphqlMock
    })
  }))

  jest.unstable_mockModule('@octokit/graphql', () => ({
    graphql: {
      defaults: () => deleteGraphqlMock
    }
  }))

  return import('../src/index.js')
}

function setDefaultInputs() {
  inputs.set('github-token', 'test-token')
  inputs.set('target-repo', 'owner/repo')
  inputs.set('discussion-category-name', 'Announcements')
  inputs.set('discussion-title-template', '')
  inputs.set('expiration-hours', '168')
  inputs.set('cleanup-mode', 'expiration')
}

beforeEach(() => {
  inputs.clear()
  setDefaultInputs()

  infoMock.mockReset()
  debugMock.mockReset()
  setOutputMock.mockReset()
  setFailedMock.mockReset()
  getInputMock.mockReset()
  graphqlMock.mockReset()
  deleteGraphqlMock.mockReset()
  getInputMock.mockImplementation(getInputValue)

  jest.useFakeTimers().setSystemTime(new Date('2024-01-10T00:00:00Z'))
})

afterEach(() => {
  jest.useRealTimers()
})

describe('run', () => {
  it('deletes expired discussions that match the template', async () => {
    graphqlMock
      .mockResolvedValueOnce({
        repository: {
          discussionCategories: {
            nodes: [{ id: 'cat-123', name: 'Announcements' }]
          }
        }
      })
      .mockResolvedValueOnce({
        repository: {
          discussions: {
            nodes: [
              {
                id: 'disc-1',
                title: 'SWA access invite for @alice (my-swa) - 2024-01-01',
                createdAt: '2024-01-01T00:00:00Z',
                url: 'https://github.com/owner/repo/discussions/1'
              },
              {
                id: 'disc-2',
                title: 'SWA access invite for @bob (my-swa) - 2024-01-09',
                createdAt: '2024-01-09T00:00:00Z',
                url: 'https://github.com/owner/repo/discussions/2'
              },
              {
                id: 'disc-3',
                title: 'Random discussion',
                createdAt: '2024-01-01T00:00:00Z',
                url: 'https://github.com/owner/repo/discussions/3'
              }
            ]
          }
        }
      })
    deleteGraphqlMock.mockResolvedValue({})

    const { run } = await loadModule()
    await run()

    expect(deleteGraphqlMock).toHaveBeenCalledTimes(1)
    expect(deleteGraphqlMock).toHaveBeenCalledWith(expect.any(String), {
      id: 'disc-1'
    })
    expect(setOutputMock).toHaveBeenCalledWith('deleted-count', 1)
    expect(setFailedMock).not.toHaveBeenCalled()
  })

  it('deletes all matching discussions in immediate mode', async () => {
    inputs.set('cleanup-mode', 'immediate')
    graphqlMock
      .mockResolvedValueOnce({
        repository: {
          discussionCategories: {
            nodes: [{ id: 'cat-123', name: 'Announcements' }]
          }
        }
      })
      .mockResolvedValueOnce({
        repository: {
          discussions: {
            nodes: [
              {
                id: 'disc-1',
                title: 'SWA access invite for @alice (my-swa) - 2024-01-01',
                createdAt: '2024-01-01T00:00:00Z',
                url: 'https://github.com/owner/repo/discussions/1'
              },
              {
                id: 'disc-2',
                title: 'SWA access invite for @bob (my-swa) - 2024-01-09',
                createdAt: '2024-01-09T00:00:00Z',
                url: 'https://github.com/owner/repo/discussions/2'
              }
            ]
          }
        }
      })
    deleteGraphqlMock.mockResolvedValue({})

    const { run } = await loadModule()
    await run()

    expect(deleteGraphqlMock).toHaveBeenCalledTimes(2)
    expect(setOutputMock).toHaveBeenCalledWith('deleted-count', 2)
  })

  it('fails when category is not found', async () => {
    graphqlMock.mockResolvedValueOnce({
      repository: {
        discussionCategories: {
          nodes: [{ id: 'cat-456', name: 'Other' }]
        }
      }
    })

    const { run } = await loadModule()
    await run()

    expect(setFailedMock).toHaveBeenCalledWith(
      'Category "Announcements" not found.'
    )
    expect(deleteGraphqlMock).not.toHaveBeenCalled()
  })

  it('handles non-Error exceptions', async () => {
    graphqlMock.mockRejectedValueOnce('GraphQL error')

    const { run } = await loadModule()
    await run()

    expect(setFailedMock).toHaveBeenCalledWith('GraphQL error')
  })

  it('uses context repo when target-repo is not specified', async () => {
    inputs.set('target-repo', '')
    graphqlMock
      .mockResolvedValueOnce({
        repository: {
          discussionCategories: {
            nodes: [{ id: 'cat-123', name: 'Announcements' }]
          }
        }
      })
      .mockResolvedValueOnce({
        repository: {
          discussions: { nodes: [] }
        }
      })

    const { run } = await loadModule()
    await run()

    expect(infoMock).toHaveBeenCalledWith(
      'Searching for discussions in ctx-owner/ctx-repo category "Announcements"'
    )
    expect(setOutputMock).toHaveBeenCalledWith('deleted-count', 0)
  })

  it('logs debug when skipping non-matching discussions', async () => {
    graphqlMock
      .mockResolvedValueOnce({
        repository: {
          discussionCategories: {
            nodes: [{ id: 'cat-123', name: 'Announcements' }]
          }
        }
      })
      .mockResolvedValueOnce({
        repository: {
          discussions: {
            nodes: [
              {
                id: 'disc-1',
                title: 'Unrelated discussion',
                createdAt: '2024-01-01T00:00:00Z',
                url: 'https://github.com/owner/repo/discussions/1'
              }
            ]
          }
        }
      })

    const { run } = await loadModule()
    await run()

    expect(debugMock).toHaveBeenCalledWith(
      'Skipping: "Unrelated discussion" (Expired: true, Match: false)'
    )
    expect(deleteGraphqlMock).not.toHaveBeenCalled()
    expect(setOutputMock).toHaveBeenCalledWith('deleted-count', 0)
  })

  it('handles missing required inputs', async () => {
    inputs.delete('github-token')

    const { run } = await loadModule()
    await run()

    expect(setFailedMock).toHaveBeenCalledWith(
      'Input required and not supplied: github-token'
    )
  })
})
