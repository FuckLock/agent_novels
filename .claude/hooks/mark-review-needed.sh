#!/bin/bash
# PostToolUse hook: 代码文件被编辑/创建后标记需要 review
# 排除已知的非代码文件，其余都触发

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# 排除非代码文件，其余都标记需要 review
# .claude/hooks/ 下的 .sh 是 harness hook 脚本，与业务代码 review 正交——排除（v4.1 施工中修复）
case "$FILE_PATH" in
  */.claude/hooks/*.sh|*.md|*.txt|*.json|*.yaml|*.yml|*.toml|*.lock|*.log|*.env|*.env.*|*.gitignore|*.prettierrc|*.eslintrc|*/.needs-review|*/.claude/.needs-review)
    ;;
  *)
    echo "needs_review" > "$CLAUDE_PROJECT_DIR/.claude/.needs-review"
    ;;
esac

exit 0
