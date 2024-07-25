# Amber金属建模教程

1、准备非标准残基的构建：将分子对接得到的小分子进行加氢处理，将金属单独扣出，建立一个PDB
2、将不含金属部分的小分子pdb转化为mol2文件
命令：antechamber -i BZE.pdb -fi pdb -o BZE.mol2 -fo mol2 -c bcc -rn BZE -at gaff -pf Y -j 5 -nc 0          #0是体系电荷数，必须要合理准确
或者可以使用课题组的方案通过com文件计算出gesp文件再转换为mol2文件，以及frcmod文件
3、将mol2文件转换为frcmod文件，用于leap建模
`parmchk2 -i NDP1.mol2 -f mol2 -o NDP1.frcmod -a Y   `
4、处理金属离子，使用amber自带脚本metalpdb2mol2.py处理，需要先去gpu里拷出来
将其放在与金属离子一个目录下
`./metalpdb2mol2.py -i FE.pdb -o FE.mol2 -c 2  `      #2代表的是离子电荷
5、准备处理标准残基PDB
>[!IMPORTANT]
>将分子对接中的蛋白通过去水，加氢以及去掉所有非标准残基的pdb保存为标准残基pdb
   这里建议使用H++，来进行加氢，输出的与amber配套pdb十分合理

使用得到的拓扑文件和坐标文件建模：
`ambpdb -p 0.15_80_10_pH6.5_1OKL.top -c 0.15_80_10_pH6.5_1OKL.crd > 1OKL_Hpp.pdb`
6、将所有PDB 文件组合成一个 PDB 文件
为了与 PDB 文件中的通常顺序保持一致，一般先放置标准残基，然后是金属离子，然后是配体，最后是水
`cat FE.pdb CPA.pdb CPB.pdb > FC_pre.pdb`    #将所有蛋白合并到FC_pre.pdb中
7、使用 pdb4amber 重新编号 PDB 文件，注意删除所得 FC.pdb 里面的 TER 行
`pdb4amber -i FC_pre.pdb -o FC.pdb`
复合物PDB的原子名称一定要和.mol2文件保持一致，可以将它们放到同一个文件夹，运行pdb.py脚本即可一键修改。（该脚本在md教程里）
```
手动创建输入文件：FC.in
# 指定原始的 pdb 文件名为 FC.pdb，该文件包含了模拟中要使用的分子结构
original_pdb=FC.pdb
#指定分子群的名称为 FC，用于标识模拟系统中的特定组分
group_name=FC
#指定范德华力的截断半径为 2.5 Å，超出此距离的相互作用将被截断
cut_off=2.5
#指定要添加到模拟系统中的离子的 id 号码为 1，这个号码是原子多少号，而不是残基号
ion_ids=1
#指定包含要添加到模拟系统中的离子结构的 mol2 文件名为 FE.mol2
ion_mol2files=FE.mol2
#指定包含非标准氨基酸（NAA）的 mol2 文件名，这些文件包含了模拟系统中其他非标准氨基酸的结构
naa_mol2files="CPA.mol2 CPB.mol2"
#指定包含非标准氨基酸力场参数的 frcmod 文件名，这些文件包含了模拟系统中其他非标准氨基酸的力场参数
frcmod_files="CPA.frcmod CPB.frcmod"
#指定额外的残基号码为 2 和 3，这个是残基好，这些残基可能需要额外处理或特殊设置
additional_resids="2 3" 
命令：MCPB.py -i FC.in -s 1
```
 9、上面过程将生成小型（small）、标准（standard）和大型（large）模型的 PDB 和指纹（fingerprint）文件。小型和大型模型的高斯输入文件（.com）也会生成。大型模型的高斯输入文件将首先对氢原子执行优化，以纠正任何位置不佳的氢原子。如果得到的pdb文件中金属不和原子配位（对于你需要配位但没有），需要将得到的指纹文件（fingerprint）进行建连关系，指纹文件的原子类型会被自动改掉，需要之后自己手动修改。
>[!IMPORTANT]
>Fingerprint文件必须要检查修改
在末尾添加：LINK 原子编号1-原子名1 原子编号2-原子名2

10、执行 Gaussian/GAMESS-US 计算(如果已经优化过结构或者结构合理即可对small跳过结构优化，但最好还是做一下)对三个.com文件（其中fc的计算需要用到opt的chk文件）进行高斯计算，得到的chk文件转化为fchk复制到同一文件夹。确保高斯输入文件的多重度正确。
如果后来者能执行并行计算最好，比较省时间。

11. 执行最终建模
需要两个chk文件，和指纹文件
命令：MCPB.py -i FC.in -s 2
观察输出文件如果没有键长键角的输出，证明成键没有被正确识别（对于你需要配位但没有），可以得到一个 FC_mcpbpy.frcmod 文件，该文件将用于 leap 建模
使用 ChgModB 执行 RESP 电荷拟合并为金属位点残基生成 mol2 文件（需要XX_large_mk.log文件由XX_large_mk.com文件计算所得）
`MCPB.py -i FC.in -s 3a`    #3a所有电荷可变
生成 tleap 输入文件
`MCPB.py -i FC.in -s 4`
使用 tleap 生成拓扑和坐标文件：
`tleap -s -f FC_tleap.in > FC_tleap.out`
现在生成了溶液中的拓扑和坐标文件（FC_solv.prmtop 和 FC_solv.inpcrd），以及真空中的拓扑和坐标文件（FC_dry.prmtop 和 FC_dry.inpcrd）
12.检查是否合理
使用 cpptraj 检查原子编号问题
`cpptraj -p FC_solv.prmtop`

```
如果报告如下错误：
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
使用 cpptraj 来修复原子顺序
```
```
fixatord.in 
脚本内容：
fixatomorder outprefix fixed
trajout restart fixed.FC_solv.inpcrd
run
quit
```
`cpptraj -p FC_solv.prmtop -c FC_solv.inpcrd -i fixatord.in > fixatord.out`
再次检查有没有错误，没有错误继续建模
使用 ParmEd 来检查金属位点参数
```
创建脚本
mcpbpy_parmed.in
printBonds :FE1                #FE1是金属掩码，可以在输出的mol2文件查到
printAngles :FE1
printDihedrals :FE1
printDetails :FE1
```
`parmed -i mcpbpy_parmed.in -p FC_solv.prmtop`
金属离子相关参数遵循以下标准：
金属离子与其配位原子的键力常数小于 200 kcal/(mol*Angstrom^2)，平衡键距离小于 2.8 埃；
与金属离子相关的角力常数通常小于100 kcal/(mol*Rad^2)，而平衡角值大于100度；
对于涉及金属的二面角，所有或大部分二面角势垒为零；
金属离子的RESP电荷小于其氧化态，通常甚至小于+1；
一种金属离子的 LJ 半径通常大于 1.0 埃。
无误即可进行MD模拟
