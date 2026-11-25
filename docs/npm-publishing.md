# npm 发布运维手册

> 记录发布链路、关键时间点和排查入口。最后更新：2026-11-25。

## 发布链路概览

| 项 | 值 |
|---|---|
| 发布工作流 | [`.github/workflows/npm-publish.yml`](../.github/workflows/npm-publish.yml) |
| 触发条件 | 推送 `v*.*.*` 标签，或手动 workflow_dispatch |
| 发布的包 | `@esyion/vakatime-core`（`packages/core`）→ `@esyion/vakatime`（`packages/collector`，即 CLI） |
| 版本管理 | 两个包 package.json 的 `version` 一起手动 bump |
| 认证方式 | GitHub Secret `NPM_TOKEN`（⚠️ 计划迁移 Trusted Publishing，见下文） |
| 本仓库 | **公开**（provenance 要求），dashboard 应用在私有仓库 `esyion/vakatime` |

工作流执行顺序：install → test（两个包）→ build（两个包）→ pack → publish core → publish collector。

## 发布操作

```bash
# 1. 同时更新 packages/core/package.json 和 packages/collector/package.json 的 version
# 2. 提交并推送
git push

# 3. 打标签（版本号与 package.json 一致）
git tag v0.1.2
git push origin v0.1.2   # 触发 GitHub Actions 发布

# 4. 到 GitHub Actions 页面确认工作流全绿
```

注意：`npm view` 走 CDN 可能有分钟级滞后，验证发布用直连 API：

```bash
curl -s https://registry.npmjs.org/@esyion%2Fvakatime | grep -o '"latest":"[^"]*"'
```

npm 不允许覆盖或删除后重用版本号，发错了只能 bump 新版本。

## 历史状态记录

- **2026-11-25（拆仓）**：本仓库从 `esyion/vakatime` monorepo 拆出（该仓库转私有以保护 dashboard 源码）。`v0.1.1` 为本仓库首次发布。已发布的 `0.1.0` provenance 指向当时的公开旧仓库，无影响。
- **2026-11-25（首次发布）**：`0.1.0` 从 monorepo 发布。首次尝试因旧仓库为私有导致 provenance 422 失败（npm 仅支持公开仓库的 provenance），短暂公开后重试成功，随后转回私有。全历史泄密审计干净。

## ⚠️ 关键时间点：2027 年 1 月

npm 官方公告：**勾选了 Bypass 2FA 的 token 自 2027 年 1 月起不能再用于直接发布**（账号操作限制已于 2026 年 8 月生效）。

当前 CI 用的 token 勾选了 Bypass 2FA，因此**必须在 2027 年 1 月前迁移到 Trusted Publishing**，否则 CI 发布会失败。

## Trusted Publishing 迁移计划

Trusted Publishing 是 npm 的免 token 发布机制：包设置里登记「仓库 + 工作流文件 + 环境」，发布时 GitHub 通过 OIDC 签发几分钟过期的临时令牌。本仓库工作流已具备条件（`id-token: write`、`registry-url` 已配置），迁移只需：

1. 到 npmjs.com 打开 `@esyion/vakatime-core` → **Settings** → **Trusted Publishing**，登记：Repository（`esyion/vakatime-cli`）、Workflow filename（`npm-publish.yml`）、Environment（可选）
2. 对 `@esyion/vakatime` 重复
3. 删除工作流中的 `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`
4. 删除 GitHub Secret `NPM_TOKEN`，吊销 npm 上的 Granular Token
5. （可选）建 GitHub Environment 加保护规则（如仅 master 分支可发布）

## NPM_TOKEN 更换/新建速查

1. npmjs.com → 头像 → **Access Tokens** → **Generate New Token** → **Granular Access Token**
2. 配置：
   - Packages and scopes → Permissions：**Read and write (publish and stage)**（不是 stage only）
   - 包范围：`@esyion` scope；列表选不到就选 All packages
   - Organizations：No access
   - Expiration：**365 days**（到期需重建）
3. 复制 token（只显示一次）
4. 本仓库 → Settings → Secrets and variables → Actions → 更新 `NPM_TOKEN`

## 排查速查表

| 症状 | 原因 | 处理 |
|---|---|---|
| 工作流没触发 | tag 没推或格式不是 `v*.*.*` | `git push origin vX.Y.Z` |
| `ENEEDAUTH` / 401 | `NPM_TOKEN` 未配置/过期 | 按上面速查重建 |
| `EOTP` | token 没勾 Bypass 2FA 且账号开了写操作 2FA | 重建 token 并勾选 Bypass 2FA |
| 403 | token 权限不对或无 `@esyion` scope 权限 | 检查 token 权限与范围 |
| 422 provenance 错误 | 仓库是私有的 | **本仓库必须保持公开**，或去掉 `--provenance` |
| `E409` / already exists | 版本号已发布过 | bump 版本号重发 |
| test/build 失败 | 代码问题 | 看 Actions 日志修复后重新打 tag |
| `npm view` 看不到新版本 | CDN 元数据缓存滞后 | 用上面的 curl 直连 API 验证 |
| 2027 年 1 月后 403 | Bypass 2FA token 被禁用 | 迁移 Trusted Publishing |

## 验证发布是否成功

```bash
curl -s https://registry.npmjs.org/@esyion/vakatime | grep -o '"latest":"[^"]*"'
curl -s https://registry.npmjs.org/@esyion%2Fvakatime-core | grep -o '"latest":"[^"]*"'
npx @esyion/vakatime --version
```
