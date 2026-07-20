// scripts/build-experts-json.js — 扫描部门目录下的 .md 文件,生成 .data/experts.json
// CommonJS, 不依赖任何 npm 包(agency-agents-zh 仓库可能没有 package.json)
// 在 GitHub Actions 中直接 `node scripts/build-experts-json.js` 运行

const fs = require('fs')
const path = require('path')

const REPO_ROOT = path.resolve(__dirname, '..')
const OUTPUT_DIR = path.join(REPO_ROOT, '.data')
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'experts.json')
const RAW_BASE = 'https://raw.githubusercontent.com/kentpan/agency-agents-zh/main'

// 跳过的文件名(不分大小写)
const SKIP_FILES = new Set([
  'readme.md',
  'catalog.md',
  'agent-list.md',
  'changelog.md',
  'license',
])

// 20 个已知部门(仅用于参考, 实际扫描时自动识别非空目录)
const KNOWN_DEPARTMENTS = [
  'academic', 'design', 'engineering', 'finance', 'game-development',
  'gis', 'hr', 'integrations', 'legal', 'marketing',
  'media', 'operations', 'product', 'qa', 'research',
  'sales', 'security', 'services', 'support', 'translation',
]

/**
 * 简易 YAML frontmatter 解析(不依赖 gray-matter)
 * 仅支持扁平 key: value 格式, value 自动去除首尾引号
 */
function parseFrontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!m) return { data: {}, content: md }
  const data = {}
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/)
    if (kv) data[kv[1]] = kv[2].replace(/^["']|["']$/g, '')
  }
  return { data, content: m[2] }
}

/**
 * 从 markdown body 第一段提取 description
 */
function extractDescription(content) {
  const trimmed = content.trim()
  if (!trimmed) return ''
  // 优先: 第一个非空段落(跳过标题)
  const lines = trimmed.split('\n')
  let desc = ''
  for (const line of lines) {
    const s = line.trim()
    if (!s) continue
    if (s.startsWith('#')) continue
    desc = s
    break
  }
  // 截断到 120 字符
  return desc.length > 120 ? desc.slice(0, 120) + '...' : desc
}

function scanDepartment(dirName) {
  const dirPath = path.join(REPO_ROOT, dirName)
  if (!fs.existsSync(dirPath)) return []
  const stat = fs.statSync(dirPath)
  if (!stat.isDirectory()) return []

  const files = fs.readdirSync(dirPath).sort()
  const experts = []
  for (const fname of files) {
    if (!fname.endsWith('.md')) continue
    if (SKIP_FILES.has(fname.toLowerCase())) continue
    const fullPath = path.join(dirPath, fname)
    const id = fname.replace(/\.md$/, '')
    const githubPath = `${dirName}/${fname}`
    const rawUrl = `${RAW_BASE}/${githubPath}`

    let md = ''
    try {
      md = fs.readFileSync(fullPath, 'utf8')
    } catch (e) {
      console.warn(`⚠️ 读取失败: ${githubPath} — ${e.message}`)
      continue
    }

    const { data, content } = parseFrontmatter(md)
    experts.push({
      id,
      department: dirName,
      name: data.name || id,
      description: data.description || extractDescription(content),
      emoji: data.emoji || '🤖',
      color: data.color || 'purple',
      githubPath,
      rawUrl,
    })
  }
  return experts
}

function main() {
  console.log('🔍 扫描部门目录...')
  // 自动识别非空目录(优先 KNOWN_DEPARTMENTS, 也扫描其他一级目录)
  const allDirs = new Set(KNOWN_DEPARTMENTS)
  try {
    for (const entry of fs.readdirSync(REPO_ROOT)) {
      const p = path.join(REPO_ROOT, entry)
      if (fs.statSync(p).isDirectory() && !entry.startsWith('.') && entry !== 'scripts' && entry !== 'node_modules') {
        allDirs.add(entry)
      }
    }
  } catch (e) {
    console.warn(`⚠️ 扫描根目录失败: ${e.message}`)
  }

  const allExperts = []
  const usedDepartments = []
  for (const dir of allDirs) {
    const list = scanDepartment(dir)
    if (list.length > 0) {
      usedDepartments.push(dir)
      allExperts.push(...list)
    }
  }

  // 按部门 + id 排序
  allExperts.sort((a, b) => {
    if (a.department !== b.department) return a.department.localeCompare(b.department)
    return a.id.localeCompare(b.id)
  })

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }
  // 输出包含 generatedAt 时间戳,用于本地同步时检测更新
  const payload = {
    generatedAt: new Date().toISOString(),
    total: allExperts.length,
    experts: allExperts,
  }
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(payload, null, 2) + '\n', 'utf8')

  console.log(`\n✅ 完成:`)
  console.log(`   - 专家总数: ${allExperts.length}`)
  console.log(`   - 部门数量: ${usedDepartments.length}`)
  console.log(`   - 部门列表: ${usedDepartments.join(', ')}`)
  console.log(`   - 输出文件: ${path.relative(REPO_ROOT, OUTPUT_FILE)}`)
  console.log(`   - 生成时间: ${payload.generatedAt}`)
}

main()
