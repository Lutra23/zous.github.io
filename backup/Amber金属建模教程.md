## 博客助手：分子动力学模拟前的准备工作

### 1. 准备非标准残基的构建
- **步骤**：将分子对接得到的小分子进行加氢处理，将金属单独扣出，建立一个PDB文件。
- **目的**：确保小分子和金属离子的结构准确，为后续建模打下基础。

### 2. 转换小分子PDB文件为mol2格式
- **命令**：
  ```bash
  antechamber -i BZE.pdb -fi pdb -o BZE.mol2 -fo mol2 -c bcc -rn BZE -at gaff -pf Y -j 5 -nc 0
  ```
  - **说明**：`-nc 0`表示体系电荷数为0，需根据实际情况调整。
- **替代方案**：通过com文件计算出gesp文件再转换为mol2文件，以及frcmod文件。

### 3. 将mol2文件转换为frcmod文件
- **命令**：
  ```bash
  parmchk2 -i NDP1.mol2 -f mol2 -o NDP1.frcmod -a Y
  ```
  - **目的**：为leap建模准备力场参数文件。

### 4. 处理金属离子
- **步骤**：使用amber自带脚本`metalpdb2mol2.py`处理金属离子。
- **命令**：
  ```bash
  ./metalpdb2mol2.py -i FE.pdb -o FE.mol2 -c 2
  ```
  - **说明**：`-c 2`代表离子电荷数为2。

### 5. 准备标准残基PDB
- **重要提示**：将分子对接中的蛋白通过去水、加氢以及去掉所有非标准残基的pdb保存为标准残基pdb。
- **建议**：使用H++进行加氢，输出的pdb与amber配套十分合理。
- **命令**：
  ```bash
  ambpdb -p 0.15_80_10_pH6.5_1OKL.top -c 0.15_80_10_pH6.5_1OKL.crd > 1OKL_Hpp.pdb
  ```

### 6. 将所有PDB文件组合成一个PDB文件
- **步骤**：为了与PDB文件中的通常顺序保持一致，一般先放置标准残基，然后是金属离子，然后是配体，最后是水。
- **命令**：
  ```bash
  cat FE.pdb CPA.pdb CPB.pdb > FC_pre.pdb
  ```
  - **说明**：将所有蛋白合并到FC_pre.pdb中。

### 7. 使用pdb4amber重新编号PDB文件
- **步骤**：注意删除所得FC.pdb里面的TER行。
- **命令**：
  ```bash
  pdb4amber -i FC_pre.pdb -o FC.pdb
  ```
- **提示**：复合物PDB的原子名称一定要和.mol2文件保持一致，可以将它们放到同一个文件夹，运行pdb.py脚本即可一键修改。

### 8. 手动创建输入文件：FC.in
- **内容**：
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
- **命令**：
  ```bash
  MCPB.py -i FC.in -s 1
  ```

### 9. 生成小型、标准和大型模型的PDB和指纹文件
- **步骤**：小型和大型模型的高斯输入文件（.com）也会生成。大型模型的高斯输入文件将首先对氢原子执行优化。
- **重要提示**：如果得到的pdb文件中金属不和原子配位，需要将得到的指纹文件进行建连关系，指纹文件的原子类型会被自动改掉，需要之后自己手动修改。
- **操作**：在指纹文件末尾添加：
  ```plaintext
  LINK 原子编号1-原子名1 原子编号2-原子名2
  ```

### 10. 执行Gaussian/GAMESS-US计算
- **步骤**：对三个.com文件进行高斯计算，得到的chk文件转化为fchk复制到同一文件夹。确保高斯输入文件的多重度正确。
- **提示**：如果已经优化过结构或者结构合理即可对small跳过结构优化，但最好还是做一下。并行计算可以节省时间。

### 11. 执行最终建模
- **步骤**：需要两个chk文件和指纹文件。
- **命令**：
  ```bash
  MCPB.py -i FC.in -s 2
  ```
- **检查**：观察输出文件，如果没有键长键角的输出，证明成键没有被正确识别。可以得到一个FC_mcpbpy.frcmod文件，该文件将用于leap建模。
- **电荷拟合**：使用ChgModB执行RESP电荷拟合并为金属位点残基生成mol2文件。
  ```bash
  MCPB.py -i FC.in -s 3a
  ```
- **生成tleap输入文件**：
  ```bash
  MCPB.py -i FC.in -s 4
  ```
- **使用tleap生成拓扑和坐标文件**：
  ```bash
  tleap -s -f FC_tleap.in > FC_tleap.out
  ```
- **结果**：生成了溶液中的拓扑和坐标文件（FC_solv.prmtop和FC_solv.inpcrd），以及真空中的拓扑和坐标文件（FC_dry.prmtop和FC_dry.inpcrd）。

### 12. 检查是否合理
- **工具**：使用cpptraj检查原子编号问题。
  ```bash
  cpptraj -p FC_solv.prmtop
  ```
- **错误处理**：如果出现以下错误：
  ```plaintext
  Error: Atom XXX was assigned a lower molecule # than previous atom. This can
  Error: happen if 1) bond information is incorrect or missing, or 2) if the
  Error: atom numbering in molecules is not sequential. If topology did not
  Error: originally contain bond info, 1) can potentially be fixed by
  Error: increasing the bondsearch cutoff offset (currently 0.200). 2) can be
  Error: fixed by either using the 'fixatomorder' command, or using
  Error: the 'setMolecules' command in parmed.py.
  Error: Could not determine molecule information for FC_solv.prmtop.
  Error: SetSolventInfo: No molecule information.
  Error: Could not determine solvent information for FC_solv.prmtop
  ```
- **修复步骤**：使用cpptraj来修复原子顺序。
  - **脚本内容**：
    ```ini
    fixatomorder outprefix fixed
    trajout restart fixed.FC_solv.inpcrd
    run
    quit
    ```
  - **命令**：
    ```bash
    cpptraj -p FC_solv.prmtop -c FC_solv.inpcrd -i fixatord.in > fixatord.out
    ```
- **再次检查**：确保没有错误后继续建模。

### 13. 使用ParmEd检查金属位点参数
- **步骤**：创建脚本mcpbpy_parmed.in。
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
- **标准**：金属离子相关参数遵循以下标准：
  - 金属离子与其配位原子的键力常数小于200 kcal/(mol*Angstrom^2)，平衡键距离小于2.8埃；
  - 与金属离子相关的角力常数通常小于100 kcal/(mol*Rad^2)，而平衡角值大于100度；
  - 对于涉及金属的二面角，所有或大部分二面角势垒为零；
  - 金属离子的RESP电荷小于其氧化态，通常甚至小于+1；
  - 一种金属离子的LJ半径通常大于1.0埃。

- **最终步骤**：无误即可进行MD模拟。

---

通过以上步骤，可以确保分子动力学模拟前的准备工作顺利进行，为后续的模拟打下坚实的基础。