<#
.SYNOPSIS
    Master Website Generation Stack Installer & Reference Vault Manager.
.DESCRIPTION
    Installs and verifies the 3-Layer Website Mastery stack:
    1. Local Reference UI Vault (.reference-ui/) with shallow Git clones.
    2. MCP Configuration (shadcn, firecrawl, playwright, 21st-dev, figma, svgmaker, lighthouse).
    3. 10 Specialized Website Generation Skills in .agent/skills/.
.PARAMETER CloneRepos
    Clones the reference UI repositories into .reference-ui/ using git clone --depth 1.
.PARAMETER Repos
    Specific repo keys to clone (e.g. "shadcn-ui", "magicui", "motion-primitives"). Default: all.
#>
param(
    [switch]$CloneRepos,
    [string[]]$Repos = @()
)

$ErrorActionPreference = "Continue"

Write-Host "`n=== [LAYER 1] Checking .gitignore and .reference-ui Vault ===" -ForegroundColor Cyan
if (Test-Path ".gitignore") {
    $ignored = Select-String -Path ".gitignore" -Pattern "^\.reference-ui/?" -Quiet
    if (-not $ignored) {
        Add-Content -Path ".gitignore" -Value "`n# Local Website UI Reference Vault`n.reference-ui/"
        Write-Host "Added .reference-ui/ to .gitignore" -ForegroundColor Green
    } else {
        Write-Host ".reference-ui/ already present in .gitignore" -ForegroundColor DarkGray
    }
}

if (-not (Test-Path ".reference-ui")) {
    New-Item -ItemType Directory -Force -Path ".reference-ui" | Out-Null
    Write-Host "Created .reference-ui/ directory" -ForegroundColor Green
}

$repoMap = [ordered]@{
    "shadcn-ui"         = "https://github.com/shadcn-ui/ui.git"
    "magicui"           = "https://github.com/magicuidesign/magicui.git"
    "motion-primitives" = "https://github.com/ibelick/motion-primitives.git"
    "react-bits"        = "https://github.com/DavidHDev/react-bits.git"
    "cult-ui"           = "https://github.com/nolly-studio/cult-ui.git"
    "tailark"           = "https://github.com/tailark/blocks.git"
    "heroui"            = "https://github.com/heroui-inc/heroui.git"
    "lenis"             = "https://github.com/darkroomengineering/lenis.git"
    "drei"              = "https://github.com/pmndrs/drei.git"
    "tremor"            = "https://github.com/tremorlabs/tremor.git"
    "lucide"            = "https://github.com/lucide-icons/lucide.git"
    "dub"               = "https://github.com/dubinc/dub.git"
}

if ($CloneRepos) {
    Write-Host "`nCloning Reference Repositories (--depth 1)..." -ForegroundColor Cyan
    $targetsToClone = if ($Repos.Count -gt 0) { $Repos } else { $repoMap.Keys }
    foreach ($name in $targetsToClone) {
        if (-not $repoMap.Contains($name)) {
            Write-Warning "Unknown repo key '$name'. Skipping."
            continue
        }
        $targetDir = ".reference-ui\$name"
        if (-not (Test-Path $targetDir)) {
            Write-Host "  -> Cloning $name from $($repoMap[$name])..." -ForegroundColor Yellow
            git clone --depth 1 $repoMap[$name] $targetDir
        } else {
            Write-Host "  -> [OK] $name already cloned in .reference-ui\$name" -ForegroundColor Green
        }
    }
} else {
    Write-Host "`nTo shallow-clone reference repositories into .reference-ui/, run:" -ForegroundColor Yellow
    Write-Host "  .\scripts\setup_website_generation_stack.ps1 -CloneRepos" -ForegroundColor White
}

Write-Host "`n=== [LAYER 2] Checking MCP Configuration ===" -ForegroundColor Cyan
$mcpJsonPath = "mcp.json"
if (-not (Test-Path $mcpJsonPath)) {
    $mcpTemplate = @{
        "mcpServers" = [ordered]@{
            "shadcn" = @{
                "command" = "npx"
                "args" = @("shadcn@latest", "mcp")
            }
            "firecrawl-mcp" = @{
                "command" = "npx"
                "args" = @("-y", "firecrawl-mcp")
                "env" = @{
                    "FIRECRAWL_API_KEY" = "YOUR_FIRECRAWL_API_KEY"
                }
            }
            "playwright-mcp" = @{
                "command" = "npx"
                "args" = @("-y", "@playwright/mcp@latest")
            }
            "21st-dev-magic" = @{
                "command" = "npx"
                "args" = @("-y", "@21st-dev/magic@latest")
                "env" = @{
                    "TWENTYFIRST_API_KEY" = "YOUR_21ST_API_KEY"
                }
            }
            "figma-developer-mcp" = @{
                "command" = "npx"
                "args" = @("-y", "figma-developer-mcp")
                "env" = @{
                    "FIGMA_ACCESS_TOKEN" = "YOUR_FIGMA_ACCESS_TOKEN"
                }
            }
            "svgmaker-mcp" = @{
                "command" = "npx"
                "args" = @("-y", "@svgmaker/mcp")
            }
            "lighthouse-mcp" = @{
                "command" = "npx"
                "args" = @("-y", "lighthouse-mcp")
            }
        }
    }
    $mcpTemplate | ConvertTo-Json -Depth 5 | Set-Content -Path $mcpJsonPath -Encoding UTF8
    Write-Host "Created $mcpJsonPath template with all 7 web design MCP servers." -ForegroundColor Green
} else {
    Write-Host "$mcpJsonPath already exists." -ForegroundColor Green
}

Write-Host "`n=== [LAYER 3] Verifying 10 Website Mastery Skills in .agent/skills/ ===" -ForegroundColor Cyan
$masterSkills = @(
    "website-archetype-director",
    "scraper-to-react-transpiler",
    "typography-and-swiss-grid-mastery",
    "lighting-shaders-and-color-physics",
    "motion-and-svg-choreography",
    "threejs-and-canvas-scrollytelling",
    "interactive-product-sandbox",
    "b2b-conversion-and-copy-architecture",
    "technical-seo-and-cwv-guard",
    "multi-viewport-visual-polisher",
    "anti-hallucination-and-dependency-guard"
)

$allFound = $true
foreach ($sk in $masterSkills) {
    $p = ".agent\skills\$sk\SKILL.md"
    if (Test-Path $p) {
        $lines = (Get-Content $p).Count
        Write-Host "  -> [FOUND] $sk ($lines lines)" -ForegroundColor Green
    } else {
        Write-Host "  -> [MISSING] $sk" -ForegroundColor Red
        $allFound = $false
    }
}

if ($allFound) {
    Write-Host "`n[SUCCESS] All 10 Website Generation Skills are present and active!" -ForegroundColor Green
} else {
    Write-Host "`n[NOTICE] Some skills are still generating or missing." -ForegroundColor Yellow
}
