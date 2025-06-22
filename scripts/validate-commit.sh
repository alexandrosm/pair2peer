#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Read the commit message
commit_file=$1
commit_message=$(cat "$commit_file" | grep -v '^#' | grep -v '^$' | head -1)

# Conventional commit regex
pattern="^(feat|fix|docs|style|refactor|test|chore|perf|ci|build|revert)(\([a-zA-Z0-9_-]+\))?: .{1,100}$"

# Validate format
if [[ ! "$commit_message" =~ $pattern ]]; then
    echo -e "${RED}❌ Invalid commit message format!${NC}"
    echo -e "${RED}Your message: ${NC}$commit_message"
    echo ""
    echo -e "${BLUE}📝 Conventional Commits Format:${NC}"
    echo -e "  ${GREEN}<type>${NC}[${GREEN}<scope>${NC}]: ${GREEN}<description>${NC}"
    echo ""
    echo -e "${BLUE}📋 Valid types:${NC}"
    echo -e "  ${YELLOW}feat${NC}     - A new feature"
    echo -e "  ${YELLOW}fix${NC}      - A bug fix"
    echo -e "  ${YELLOW}docs${NC}     - Documentation only changes"
    echo -e "  ${YELLOW}style${NC}    - Code style changes"
    echo -e "  ${YELLOW}refactor${NC} - Code refactoring"
    echo -e "  ${YELLOW}test${NC}     - Adding tests"
    echo -e "  ${YELLOW}chore${NC}    - Maintenance tasks"
    echo -e "  ${YELLOW}perf${NC}     - Performance improvements"
    echo -e "  ${YELLOW}ci${NC}       - CI/CD changes"
    echo -e "  ${YELLOW}build${NC}    - Build system changes"
    echo -e "  ${YELLOW}revert${NC}   - Revert a previous commit"
    exit 1
fi

echo -e "${GREEN}✅ Valid commit message!${NC}"
exit 0