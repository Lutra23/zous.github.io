# 分子动力学模拟前的准备工作

分子动力学模拟是一项复杂且需要精细准备的工作。以下是分子动力学模拟前的详细准备流程，包含每一步操作的具体命令和注意事项，以确保模拟结果的准确性和可靠性。

---

## 1. 准备非标准残基的构建

- **步骤**：  
  将分子对接得到的小分子进行加氢处理，将金属单独提取，生成一个单独的 PDB 文件。
- **目的**：  
  确保小分子和金属离子的结构准确，为后续建模提供可靠基础。

> [!NOTE]  
> 非标准残基的准确构建非常关键，后续所有操作都依赖于这一步骤的质量。

---

## 2. 转换小分子 PDB 文件为 mol2 格式

- **命令**：
  ```bash
  antechamber -i BZE.pdb -fi pdb -o BZE.mol2 -fo mol2 -c bcc -rn BZE -at gaff -pf Y -j 5 -nc 0
  ```
  - **说明**：  
    `-nc 0` 表示体系电荷数为 0，需根据实际情况调整。

- **替代方案**：  
  可以通过 Gaussian 的 com 文件计算生成 GESP 文件后，再转换为 mol2 文件和 frcmod 文件。

> [!TIP]  
> 如果体系的电荷状态较复杂，建议优先使用 **Gaussian** 计算更为准确的电荷分布。

---

## 3. 将 mol2 文件转换为 frcmod 文件

- **命令**：
  ```bash
  parmchk2 -i NDP1.mol2 -f mol2 -o NDP1.frcmod -a Y
  ```
- **目的**：  
  为后续 Leap 建模准备力场参数文件。

> [!IMPORTANT]  
> 确保 mol2 文件的原子类型和化学环境正确，避免影响 frcmod 文件的参数生成。

---

## 4. 处理金属离子

- **脚本**：使用 Amber 自带脚本 `metalpdb2mol2.py` 处理金属离子。
- **命令**：
  ```bash
  ./metalpdb2mol2.py -i FE.pdb -o FE.mol2 -c 2
  ```
  - **说明**：  
    `-c 2` 表示金属离子的电荷数为 2。

> [!CAUTION]  
> 金属离子的电荷状态对模拟结果影响重大。务必确认电荷数准确，并检查生成的 mol2 文件是否符合预期。

---

## 5. 准备标准残基 PDB 文件

- **重要提示**：  
  将对接中的蛋白通过去水、加氢并去除所有非标准残基，保存为标准残基 PDB 文件。
- **推荐工具**：  
  使用 **H++** 进行加氢，生成的 PDB 文件与 Amber 配套性更好。
- **命令**：
  ```bash
  ambpdb -p 0.15_80_10_pH6.5_1OKL.top -c 0.15_80_10_pH6.5_1OKL.crd > 1OKL_Hpp.pdb
  ```

> [!WARNING]  
> 在处理蛋白时，请确保所有非标准残基（如配体、离子等）已经正确分离，否则可能导致后续模拟出错。

---

## 6. 合并所有 PDB 文件

- **步骤**：  
  按以下顺序合并 PDB 文件：标准残基 → 金属离子 → 配体 → 水分子。
- **命令**：
  ```bash
  cat FE.pdb CPA.pdb CPB.pdb > FC_pre.pdb
  ```

> [!TIP]  
> 为保持文件清晰，可以在合并文件后，手动检查每个部分的完整性，避免遗漏重要内容。

---

## 7. 使用 pdb4amber 重新编号 PDB 文件

- **注意**：删除合并后的 PDB 文件中的 `TER` 行。
- **命令**：
  ```bash
  pdb4amber -i FC_pre.pdb -o FC.pdb
  ```

> [!NOTE]  
> 合并后的文件需要再次检查编号是否一致，尤其是金属离子和配体部分。

---

## 8. 创建输入文件 FC.in

- **文件内容**：
  ```ini
  original_pdb=FC.pdb
  group_name=FC
  cut_off=2.5
  ion_ids=1
  ion_mol2files=FE.mol2
  naa_mol2files="CPA.mol2 CPB.mol2"
  frcmod_files="CPA.frcmod CPB.frcmod"
  additional_resids="2 3"
  ```
- **执行命令**：
  ```bash
  MCPB.py -i FC.in -s 1
  ```

> [!IMPORTANT]  
> 输入文件中的所有路径和文件名需要准确无误，否则将导致运行失败。

---

## 9. 生成模型的 PDB 和指纹文件

- **说明**：  
  小型模型和大型模型的 Gaussian 输入文件（.com）也会生成，建议对大型模型的氢原子进行优化。
- **手动调整**：  
  在指纹文件末尾添加建连信息：
  ```plaintext
  LINK 原子编号1-原子名1 原子编号2-原子名2
  ```

> [!TIP]  
> 如果发现金属未正确配位，可手动调整指纹文件中的建连关系，确保参数正确。

---

## 10. 执行 Gaussian/GAMESS-US 计算

- **步骤**：  
  对 `.com` 文件进行计算，生成的 `.chk` 文件需转换为 `.fchk` 并复制到同一文件夹。
- **优化建议**：  
  如果结构合理，可跳过小模型的结构优化，但建议进行验证。

> [!CAUTION]  
> Gaussian 输入文件的多重度设置需与体系的真实电子结构一致，错误的设置可能导致计算失败或错误结果。

---

## 11. 执行最终建模

- **命令**：
  ```bash
  MCPB.py -i FC.in -s 2
  ```
- **结果检查**：  
  如果未输出键长或键角参数，需检查是否正确识别配位键。
- **生成 RESP 电荷拟合文件**：
  ```bash
  MCPB.py -i FC.in -s 3a
  ```
- **生成 tleap 输入文件**：
  ```bash
  MCPB.py -i FC.in -s 4
  ```
- **生成拓扑和坐标文件**：
  ```bash
  tleap -s -f FC_tleap.in > FC_tleap.out
  ```

> [!NOTE]  
> 生成的拓扑文件需要与预期结果逐一对比，避免出现重要参数遗漏或错误。

---

## 12. 检查和修复

- **检查命令**：
  ```bash
  cpptraj -p FC_solv.prmtop
  ```
- **修复步骤**：
  - 创建 `fixatord.in`：
    ```ini
    fixatomorder outprefix fixed
    trajout restart fixed.FC_solv.inpcrd
    run
    quit
    ```
  - **执行修复**：
    ```bash
    cpptraj -p FC_solv.prmtop -c FC_solv.inpcrd -i fixatord.in > fixatord.out
    ```

> [!WARNING]  
> 未修复的原子顺序问题可能导致后续模拟失败，请务必检查文件一致性。

---

## 13. 检查金属位点参数

- **创建脚本 mcpbpy_parmed.in**：
  ```ini
  printBonds :FE1
  printAngles :FE1
  printDihedrals :FE1
  printDetails :FE1
  ```
- **命令**：
  ```bash
  parmed -i mcpbpy_parmed.in -p FC_solv.prmtop
  ```
- **标准**：
  - 键力常数 < 200 kcal/(mol*Å²)；
  - 平衡键距 < 2.8 Å；
  - RESP 电荷 < +1。

> [!IMPORTANT]  
> 金属离子相关的参数需要特别关注，任何异常都可能导致模拟失败或偏差。
