import * as core from '@actions/core'
import * as github from '@actions/github'
import { graphql } from '@octokit/graphql'

export type Inputs = {
  githubToken: string
  targetRepo?: string
  discussionCategoryName: string
  expirationHours: number
  discussionTitleTemplate: string
  cleanupMode: 'expiration' | 'immediate'
}

export type DiscussionNode = {
  id: string
  title: string
  createdAt: string
  url: string
}

export function parseTargetRepo(
  input: string | undefined,
  contextRepo = github.context.repo
): { owner: string; repo: string } {
  if (!input) {
    return { owner: contextRepo.owner, repo: contextRepo.repo }
  }
  const [owner, repo] = input.split('/')
  if (!owner || !repo) {
    throw new Error(`Invalid target-repo format: ${input}`)
  }
  return { owner, repo }
}

export function getInputs(): Inputs {
  return {
    githubToken: core.getInput('github-token', { required: true }),
    targetRepo: core.getInput('target-repo'),
    discussionCategoryName: core.getInput('discussion-category-name', {
      required: true
    }),
    expirationHours: parseInt(core.getInput('expiration-hours') || '168', 10),
    discussionTitleTemplate:
      core.getInput('discussion-title-template') ||
      'SWA access invite for @{login} ({swaName}) - {date}',
    cleanupMode:
      (core.getInput('cleanup-mode') as 'expiration' | 'immediate') ||
      'expiration'
  }
}

export function createTitleRegex(template: string): RegExp {
  const escaped = template.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = escaped.replace(/\\\{(\w+)\\\}/g, '.*?')
  return new RegExp(`^${pattern}$`)
}

export function shouldDeleteDiscussion(
  discussion: DiscussionNode,
  titleRegex: RegExp,
  expirationDate: Date,
  cleanupMode: 'expiration' | 'immediate'
): boolean {
  const createdAt = new Date(discussion.createdAt)
  const isExpired =
    cleanupMode === 'immediate' ? true : createdAt < expirationDate
  const isMatch = titleRegex.test(discussion.title)
  return isExpired && isMatch
}

async function deleteDiscussion(
  token: string,
  discussionId: string
): Promise<void> {
  const graphqlClient = graphql.defaults({
    headers: { authorization: `token ${token}` }
  })

  await graphqlClient(
    `
    mutation ($id: ID!) {
      deleteDiscussion(input: {id: $id}) {
        clientMutationId
      }
    }
  `,
    { id: discussionId }
  )
}

export async function run(): Promise<void> {
  try {
    const inputs = getInputs()
    const { owner, repo } = parseTargetRepo(inputs.targetRepo)

    const expirationDate = new Date(
      Date.now() - inputs.expirationHours * 60 * 60 * 1000
    )
    core.info(`Expiration cutoff: ${expirationDate.toISOString()}`)

    const octokit = github.getOctokit(inputs.githubToken)
    const titleRegex = createTitleRegex(inputs.discussionTitleTemplate)

    core.info(
      `Searching for discussions in ${owner}/${repo} category "${inputs.discussionCategoryName}"`
    )

    const categoryQuery = await octokit.graphql<{
      repository: {
        discussionCategories: { nodes: { id: string; name: string }[] }
      }
    }>(
      `
        query ($owner: String!, $repo: String!) {
            repository(owner: $owner, name: $repo) {
                discussionCategories(first: 100) {
                    nodes {
                        id
                        name
                    }
                }
            }
        }
        `,
      { owner, repo }
    )

    const category = categoryQuery.repository.discussionCategories.nodes.find(
      (n) => n.name === inputs.discussionCategoryName
    )

    if (!category) {
      throw new Error(`Category "${inputs.discussionCategoryName}" not found.`)
    }

    core.info(`Found category ID: ${category.id}`)

    const discussionsQuery = await octokit.graphql<{
      repository: {
        discussions: {
          nodes: DiscussionNode[]
        }
      }
    }>(
      `
        query ($owner: String!, $repo: String!, $categoryId: ID!) {
            repository(owner: $owner, name: $repo) {
                discussions(first: 100, categoryId: $categoryId, orderBy: {field: CREATED_AT, direction: ASC}) {
                    nodes {
                        id
                        title
                        createdAt
                        url
                    }
                }
            }
        }
        `,
      { owner, repo, categoryId: category.id }
    )

    const discussions = discussionsQuery.repository.discussions.nodes
    core.info(`Found ${discussions.length} discussions in category.`)

    let deletedCount = 0

    for (const discussion of discussions) {
      if (
        shouldDeleteDiscussion(
          discussion,
          titleRegex,
          expirationDate,
          inputs.cleanupMode
        )
      ) {
        core.info(
          `Deleting expired discussion: "${discussion.title}" (${discussion.url}) created at ${discussion.createdAt}`
        )
        await deleteDiscussion(inputs.githubToken, discussion.id)
        deletedCount++
      } else {
        const createdAt = new Date(discussion.createdAt)
        const isExpired =
          inputs.cleanupMode === 'immediate' ? true : createdAt < expirationDate
        const isMatch = titleRegex.test(discussion.title)
        core.debug(
          `Skipping: "${discussion.title}" (Expired: ${isExpired}, Match: ${isMatch})`
        )
      }
    }

    core.info(`Deleted ${deletedCount} discussions.`)
    core.setOutput('deleted-count', deletedCount)
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message)
    } else {
      core.setFailed(String(error))
    }
  }
}
