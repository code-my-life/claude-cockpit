import path from 'node:path'

// Folders the terminal may open: those of the known conversations, their sub-folders and their siblings.

const comparable = folder => (process.platform === 'win32' ? folder.toLowerCase() : folder)

const isInside = (parent, child) => {
  const relative = path.relative(comparable(path.resolve(parent)), comparable(path.resolve(child)))
  const isOutside = relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
  return !isOutside
}

const isBroadFolder = (folder, homeDir) => {
  const isDriveRoot = path.resolve(folder) === path.parse(path.resolve(folder)).root
  return isDriveRoot || isInside(folder, homeDir)
}

// The folders of the Desktop sessions and of the transcripts in the search index (terminal conversations).
export const knownRootsOf = (sessions, searchIndex) => {
  const roots = new Set()
  for (const session of sessions) {
    const cwd = session.cwd
    if (typeof cwd === 'string' && cwd !== '') roots.add(cwd)
  }
  if (searchIndex && searchIndex.files) {
    for (const entry of Object.values(searchIndex.files)) {
      const cwd = entry.cwd
      if (typeof cwd === 'string' && cwd !== '') roots.add(cwd)
    }
  }
  return [...roots]
}

// A folder inside a known root, or next to one when their parent is not too broad (drive root, home).
export const isKnownFolder = (roots, folder, homeDir) => {
  const siblingsAllowed = root => !isBroadFolder(path.dirname(root), homeDir) && isInside(path.dirname(root), folder)
  return roots.some(root => isInside(root, folder) || siblingsAllowed(root))
}
