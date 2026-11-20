import type { Element, ElementContent, Root, RootContent } from 'hast'
import { MATCH_ATTRIBUTE, MATCH_CLASS, normalizeQuery, splitByQuery } from './chat-search'

function mark(text: string): Element {
  return {
    type: 'element',
    tagName: 'mark',
    properties: { [MATCH_ATTRIBUTE]: '', className: MATCH_CLASS.split(' ') },
    children: [{ type: 'text', value: text }],
  }
}

function isElementContent(node: RootContent): node is ElementContent {
  return node.type !== 'doctype'
}

function walk(children: RootContent[], query: string): RootContent[] {
  return children.flatMap((node): RootContent[] => {
    if (node.type === 'text') {
      const parts = splitByQuery(node.value, query)
      if (!parts.some((part) => part.match)) return [node]
      return parts.map((part): RootContent => (part.match ? mark(part.text) : { type: 'text', value: part.text }))
    }
    if (node.type === 'element' && node.tagName !== 'mark') {
      node.children = walk(node.children, query).filter(isElementContent)
    }
    return [node]
  })
}

/** rehype plugin: wraps the occurrences of the query in the text of the answer into `<mark>`. */
export function rehypeSearchMarks(options: { query: string }) {
  return (tree: Root) => {
    if (normalizeQuery(options.query) === '') return
    tree.children = walk(tree.children, options.query)
  }
}
