# DSH 插件：复制文件行号引用

在 DeepSeek Harness 右侧的文件预览里，选中或点击代码行，即可复制/插入形如
`@src/main/java/.../LogAspect.java#L92-L94` 的文件引用。

## 功能

- **单击某行**：自动选中该行并复制 `@相对路径#L92`
- **拖选多行**：自动复制 `@相对路径#L92-L94`
- **悬浮工具栏**
  - 「复制引用」：写入剪贴板（成功后显示「已复制」）
  - 「插入」：把引用插入当前会话输入框（成功后显示「已插入」）
- 路径按**工作区根目录**计算

## 安装

### 方式一：按 Git 提交安装（最简单）

```
git+https://github.com/lwfjyjy/copy-file-reference.git#<commit-sha>
```

或在 DeepSeek Harness 的插件管理里用 `install_bundle`，target 填上面的地址。

### 方式二：通过插件市场索引

1. 打开 Plugins → Experimental plugins → More → 开启 **Custom plugin markets**
2. 在 **Discover** 添加索引地址：
   `https://lwfjyjy.github.io/copy-file-reference/index.json`
3. 找到「复制文件行号引用」并安装

## 兼容性

- DSH `>=0.2.1-rc.5`
- Node `>=24`
- 仅对代码高亮可打开的文本文件（如 `.java`、`.xml`）生效

## 许可证

[MIT](./LICENSE)
