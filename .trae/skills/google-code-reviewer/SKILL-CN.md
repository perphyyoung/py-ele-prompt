---
name: "code-reviewer"
description: "审查代码的正确性、可维护性和对项目标准的遵循情况。当用户请求代码审查、合并前审查或审查 PR 时调用。"
---

# Code Reviewer / 代码审查员

This skill guides the agent in conducting professional and thorough code reviews for both local development and remote Pull Requests.

本技能指导助手进行专业且全面的代码审查，适用于本地开发和远程 Pull Request。

## Workflow / 工作流程

### 1. Determine Review Target / 确定审查目标

- **Remote PR**: If the user provides a PR number or URL (e.g., "Review PR #123"), target that remote PR.
  
  **远程 PR**：如果用户提供了 PR 编号或 URL（例如"审查 PR #123"），则针对该远程 PR 进行审查。

- **Local Changes**: If no specific PR is mentioned, or if the user asks to "review my changes", target the current local file system states (staged and unstaged changes).
  
  **本地变更**：如果没有提到特定的 PR，或者用户要求"审查我的变更"，则针对当前本地文件系统状态（暂存和未暂存的变更）进行审查。

### 2. Preparation / 准备工作

#### For Remote PRs / 对于远程 PR：

- **Checkout**: Use the GitHub CLI to checkout the PR.
  
  **检出**：使用 GitHub CLI 检出 PR。
  ```bash
  gh pr checkout <PR_NUMBER>
  ```

- **Preflight**: Execute the project's standard verification suite to catch automated failures early.
  
  **预检**：执行项目的标准验证套件，尽早发现自动化失败。
  ```bash
  npm run preflight
  ```

- **Context**: Read the PR description and any existing comments to understand the goal and history.
  
  **上下文**：阅读 PR 描述和任何现有评论，以了解目标和历史。

#### For Local Changes / 对于本地变更：

- **Identify Changes**:
  
  **识别变更**：
  - Check status: `git status`
    
    检查状态：`git status`
  - Read diffs: `git diff` (working tree) and/or `git diff --staged` (staged)
    
    读取差异：`git diff`（工作区）和/或 `git diff --staged`（暂存区）

- **Preflight (Optional)**: If the changes are substantial, ask the user if they want to run `npm run preflight` before reviewing.
  
  **预检（可选）**：如果变更较大，询问用户是否希望在审查前运行 `npm run preflight`。

### 3. In-Depth Analysis / 深入分析

Analyze the code changes based on the following pillars:

基于以下维度分析代码变更：

- **Correctness**: Does the code achieve its stated purpose without bugs or logical errors?
  
  **正确性**：代码是否在没有 bug 或逻辑错误的情况下实现了其既定目标？

- **Maintainability**: Is the code clean, well-structured, and easy to understand and modify in the future? Consider factors like code clarity, modularity, and adherence to established design patterns.
  
  **可维护性**：代码是否清晰、结构良好，并且易于理解和将来修改？考虑代码清晰度、模块化和遵循既定设计模式等因素。

- **Readability**: Is the code well-commented (where necessary) and consistently formatted according to our project's coding style guidelines?
  
  **可读性**：代码是否有良好的注释（在必要时），并根据项目编码风格指南一致地格式化？

- **Efficiency**: Are there any obvious performance bottlenecks or resource inefficiencies introduced by the changes?
  
  **效率**：变更是否引入了任何明显的性能瓶颈或资源低效？

- **Security**: Are there any potential security vulnerabilities or insecure coding practices?
  
  **安全性**：是否存在潜在的安全漏洞或不安全的编码实践？

- **Edge Cases and Error Handling**: Does the code appropriately handle edge cases and potential errors?
  
  **边界情况和错误处理**：代码是否适当地处理了边界情况和潜在错误？

- **Testability**: Is the new or modified code adequately covered by tests (even if preflight checks pass)? Suggest additional test cases that would improve coverage or robustness.
  
  **可测试性**：新代码或修改后的代码是否有足够的测试覆盖（即使预检通过）？建议可以提高覆盖范围或健壮性的额外测试用例。

### 4. Provide Feedback / 提供反馈

#### Structure / 结构

- **Summary**: A high-level overview of the review.
  
  **摘要**：审查的高层次概述。

- **Findings**:
  
  **发现**：
  - **Critical**: Bugs, security issues, or breaking changes.
    
    **严重**：Bug、安全问题或破坏性变更。
  - **Improvements**: Suggestions for better code quality or performance.
    
    **改进**：提高代码质量或性能的建议。
  - **Nitpicks**: Formatting or minor style issues (optional).
    
    **吹毛求疵**：格式化或轻微风格问题（可选）。

- **Conclusion**: Clear recommendation (Approved / Request Changes).
  
  **结论**：明确的建议（批准 / 请求变更）。

#### Tone / 语气

- Be constructive, professional, and friendly.
  
  建设性、专业且友好。

- Explain why a change is requested.
  
  解释为什么请求变更。

- For approvals, acknowledge the specific value of the contribution.
  
  对于批准，认可贡献的具体价值。

### 5. Cleanup (Remote PRs only) / 清理（仅远程 PR）

After the review, ask the user if they want to switch back to the default branch (e.g., main or master).

审查后，询问用户是否要切换回默认分支（例如 main 或 master）。
