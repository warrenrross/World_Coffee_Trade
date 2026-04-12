# Jupyter Notebook Version Control Spec
## Stack: nbdime + Jupytext + nbstripout

---

## 1. Objective

Set up a Git repository so that:

- `.ipynb` is used for interactive work
- `.py` is used for clean code diffs
- `.md` is used for readable documentation
- Git history remains clean
- Notebook diffs/merges are handled with nbdime
- Outputs are stripped before commit using nbstripout
- Files are synchronized using Jupytext

---

## 2. Tool Responsibilities

| Tool | Role |
|------|------|
| Git | Version control |
| nbdime | Notebook-aware diff + merge |
| Jupytext | Sync `.ipynb` ↔ `.py` ↔ `.md` |
| nbstripout | Remove output noise from commits |

---

## 3. Install Dependencies

```bash
pip install --upgrade nbdime jupytext nbstripout
```

---

## 4. Configure Git Integration

### Enable nbdime

```bash
nbdime config-git --enable
```

---

### Enable nbstripout (repo-local)

```bash
nbstripout --install --attributes .gitattributes
```

---

## 5. Repository Structure

```
project/
├─ .gitattributes
├─ jupytext.toml
├─ notebooks/
│  └─ analysis.ipynb
├─ scripts/
│  └─ analysis.py
└─ docs/
   └─ analysis.md
```

---

## 6. Jupytext Configuration

Create `jupytext.toml`:

```toml
formats = "notebooks///ipynb,scripts///py:percent,docs///md"
notebook_metadata_filter = "kernelspec,jupytext"
cell_metadata_filter = ""
```

---

## 7. Pair Notebook Files

```bash
jupytext --set-formats "notebooks///ipynb,scripts///py:percent,docs///md" notebooks/analysis.ipynb
jupytext --sync notebooks/analysis.ipynb
```

---

## 8. Daily Workflow

### Edit Notebook

1. Open `.ipynb`
2. Save changes
3. Jupytext updates `.py` and `.md`

---

### Review Changes

```bash
git diff
```

- `.py` → clean diffs
- `.md` → readable docs
- `.ipynb` → handled by nbdime

---

### Commit

```bash
git add notebooks/analysis.ipynb scripts/analysis.py docs/analysis.md
git commit -m "Update notebook"
```

- nbstripout removes output noise automatically

---

## 9. Review Guidelines

- Review `.py` for logic changes
- Review `.md` for narrative clarity
- Use `.ipynb` only when execution context is needed
- Use nbdime locally for notebook diffs if needed

---

## 10. Merge Guidelines

- Use standard Git merge
- If conflicts occur in `.ipynb`, use nbdime tools
- Avoid manual JSON conflict resolution

---

## 11. Optional: Pre-commit Hook (Jupytext Sync)

```yaml
repos:
  - repo: https://github.com/mwouts/jupytext
    rev: v1.18.1
    hooks:
      - id: jupytext
        args: [--sync]
```

---

## 12. Guarantees

- Clean diffs via `.py`
- Structured notebook diffs via nbdime
- Clean `.ipynb` commits via nbstripout
- Synced multi-format representations

---

## 13. Limitations

- GitHub does not use nbdime
- `.md` does not include outputs automatically
- `.ipynb` still required for execution

---

## 14. Summary Workflow

```
Work in .ipynb
↓
Jupytext syncs → .py + .md
↓
nbstripout cleans outputs
↓
Git stores clean history
↓
nbdime handles notebook diffs locally
```


---

## 15. Figure Storage and Referencing

### Directory Structure

```text
project/
├─ figures/
│  ├─ <notebook_name>/
│  │  ├─ model_accuracy.png
│  │  ├─ confusion_matrix.png
│  │  └─ roc_curve.png
│  └─ shared/
│     └─ color_legend.png
```

- `figures/<notebook_name>/` → notebook-specific figures  
- `figures/shared/` → reusable figures  

---

### Naming Convention

Use stable, descriptive names:

```text
model_accuracy.png
confusion_matrix.png
feature_importance_top20.png
```

Avoid:
- auto-generated names (`output_1_0.png`)
- timestamps
- sequential numbering

---

### Saving Figures in Code

```python
from pathlib import Path
import matplotlib.pyplot as plt

FIG_DIR = Path("../figures/analysis")
FIG_DIR.mkdir(parents=True, exist_ok=True)

plt.plot([1,2,3], [4,5,6])
plt.savefig(FIG_DIR / "model_accuracy.png", bbox_inches="tight")
plt.close()
```

---

### Referencing Figures in Markdown

```markdown
![Model Accuracy](../figures/analysis/model_accuracy.png)
```

- Works in GitHub, Jupytext `.md`, and documentation workflows
- Avoid relying on notebook output cells for figures

---

### Version Control Guidance

- Track `figures/` in Git for reproducibility
- Optionally ignore temporary outputs:

```text
figures/tmp/
```

Add to `.gitignore` if needed.

---

### Anti-Patterns to Avoid

- Using nbconvert-generated `notebook_files/`
- Embedding figures only as notebook outputs
- Using unstable or auto-generated filenames
- Storing figures inside notebook metadata

---

### Summary

Use:

```text
figures/<notebook_name>/<descriptive_name>.png
```

This ensures:
- stable Git diffs
- no duplication with nbconvert
- clean integration with Jupytext
- consistent, predictable file paths
