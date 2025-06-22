#!/bin/bash

case "${1:-show}" in
    show)
        gitversion /showvariable SemVer
        ;;
    
    detailed)
        gitversion
        ;;
    
    next)
        echo "Next version based on pending commits:"
        gitversion /showvariable SemVer
        ;;
esac