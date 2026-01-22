import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const repository = process.env.GITHUB_REPOSITORY
const [owner, repo] = repository ? repository.split('/') : []
const isUserPage =
  owner && repo && repo.toLowerCase() === `${owner.toLowerCase()}.github.io`
const base = repo && !isUserPage ? `/${repo}/` : '/'

export default defineConfig({
  base,
  plugins: [react()],
})
