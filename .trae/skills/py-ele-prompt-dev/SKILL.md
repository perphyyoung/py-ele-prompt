---
name: py-ele-prompt-dev / py-ele-prompt 开发规范
description: Project-specific development guidelines for py-ele-prompt. Apply these rules when writing, reviewing, or refactoring code in this project.
描述：py-ele-prompt 项目的专属开发规范。在编写、审查或重构本项目代码时应用这些规则。
---

# Project Rule - AI 开发约束 / 项目规则 - AI 开发约束

> **关联文档**: [需求文档](../../需求文档.md) - 开发前请确认需求，开发后请验证是否符合需求

## 核心原则 / Core Principles

1. **需求一致性 / Requirement Consistency** - 修改前确认不违反 需求文档.md，修改后验证符合需求

   Before modifying, confirm it doesn't violate 需求文档.md; after modifying, verify it meets the requirements.

2. **用户确认 / User Confirmation** - 添加功能时有更好的想法，先与用户商量

   When adding features with better ideas, discuss with the user first.

3. **操作提示 / Operation Prompts** - 启动应用、安装依赖时提示用户操作

   Prompt user operations when starting applications or installing dependencies.

4. **修改计划 / Modification Plan** - 改代码前，先简述计划与影响范围, 不需要出现代码块, 除非没有代码块说不清楚; 如果有类似的功能已实现, 给出复用代码的利弊分析

   Before modifying code, briefly describe the plan and impact scope. No code blocks unless necessary. If similar functionality exists, provide pros/cons analysis of reusing code.

---

## 命名规范 / Naming Conventions

- 数据库 `snake_case`，前端 `camelCase`
- 命名体现出变量/函数/类的作用和类型, 避免太泛的通用名称

Database uses `snake_case`, frontend uses `camelCase`. Names should reflect the purpose and type of variables/functions/classes, avoiding overly generic names.

---

## 方案要求/修改计划 / Plan Requirements

- 给出实现方案或计划时, 必须考虑到方案的可维护性, 可扩展性, 性能等因素, 不能只考虑当前需求
  
  When providing implementation plans, consider maintainability, scalability, and performance, not just current requirements.

- 方案中不要出现"或", 如果有多个选项, 通过数字序号列出, 给出简要说明
  
  Don't use "or" in plans. If multiple options exist, list them with numbers and brief descriptions.

- 不允许通过 powershell 替换(utf-8问题), 可选 js 替换
  
  PowerShell replacement is not allowed (UTF-8 issues), JavaScript replacement is optional.

---

## 技术约束 / Technical Constraints

- 包管理: 使用 `cnpm` 替代 `npm` / Package management: Use `cnpm` instead of `npm`
- 命令行: 使用 `cmd` 而非 PowerShell / Command line: Use `cmd` instead of PowerShell
- 时区处理: 存储用 `new Date().toISOString()`，前端用 `new Date()` 转换 / Timezone: Store with `new Date().toISOString()`, convert with `new Date()` on frontend

---

## 界面规范 / UI Guidelines

- UI 组件样式遵循 [设计规范.md](../../设计规范.md)

UI component styles follow 设计规范.md.

---

## 代码规范 / Code Standards

### 内聚公理 / Cohesion Axiom

一个软件模块应专注于一个单一的、明确的功能或职责。如果不是这样，可以拆分成更多模块。

A software module should focus on a single, well-defined function or responsibility. If not, split into more modules.

### 耦合公理 / Coupling Axiom

模块之间相互依赖的程度应尽可能低，理想状况下一个模块不应依赖于任何其他模块的内部实现，而只通过接口互相协作。

Dependencies between modules should be minimized. Ideally, a module should not depend on any other module's internal implementation, only collaborate through interfaces.

### 接口公理 / Interface Axiom

软件模块应提供定义良好的、供其他程序模块使用的接口；定义良好的接口应尽量满足：

Software modules should provide well-defined interfaces for other modules to use. Well-defined interfaces should satisfy:

- **责任分离 Separation of Concerns**：接口只暴露必要功能，而隐藏其内部实现细节，调用方只与其交互。
  
  Interfaces expose only necessary functionality while hiding internal implementation details.

- **稳定 Stability**：一旦投入使用，接口不应轻易修改，如需要新增功能，应定义新接口，而不是改动旧的。
  
  Once in use, interfaces should not be easily modified. For new functionality, define new interfaces rather than changing old ones.

- **不可变 Immutability**：不应修改接口传入的数据或状态，而所有副作用 Side Effect 应局限在模块内。
  
  Do not modify data or state passed to interfaces. All side effects should be contained within the module.

- **契约化 Contract Based**：定义清晰的数据类型、函数、参数、返回值、异常等，形成一个完备的契约，如可能应与实现无关。
  
  Define clear data types, functions, parameters, return values, and exceptions to form a complete contract.

### 其他规范 / Other Standards

- 统一使用全局 `isSameId()` 函数, 即 `String(id1) === String(id2)` 进行 ID 比较，避免类型不匹配
  
  Use global `isSameId()` function, i.e., `String(id1) === String(id2)` for ID comparison to avoid type mismatch.

- 常量定义在 Constants 类中 / Define constants in Constants class
- 控制台只输出英文 / Console output in English only
- 注释简洁 / Concise comments
- Markdown 符合 markdownlint / Markdown follows markdownlint
- 更改与 README 不一致时提示更新 / Prompt to update README when changes are inconsistent

---
