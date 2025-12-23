# 🖥️ 高性能计算集群：从零到生产完全指南

> 🚀 打造企业级 HPC 集群，涵盖 SLURM 调度、性能监控与安全配置

---

## 📋 目录

- [架构概述](#架构概述)
- [环境准备](#环境准备)
- [网络配置](#网络配置)
- [存储配置](#存储配置)
- [用户管理](#用户管理)
- [作业调度](#作业调度)
- [监控告警](#监控告警)
- [安全加固](#安全加固)
- [性能调优](#性能调优)

---

## 🏗️ 架构概述

### 典型 HPC 集群架构

```
┌─────────────────────────────────────────────────────┐
│                    管理节点                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│  │ SLURM CTL│  │   NFS    │  │ Ganglia  │         │
│  │          │  │  Server  │  │  Monitor │         │
│  └──────────┘  └──────────┘  └──────────┘         │
└─────────────────────────────────────────────────────┘
            │
            ├─────────────────────────────────────┐
            │                                     │
┌───────────▼──────────┐      ┌──────────▼──────────┐
│    计算节点 01        │      │    计算节点 N        │
│  ┌────────────────┐  │      │  ┌────────────────┐ │
│  │   slurmd       │  │      │  │   slurmd       │ │
│  │   munge        │  │  ... │  │   munge        │ │
│  │   ypbind       │  │      │  │   ypbind       │ │
│  └────────────────┘  │      │  └────────────────┘ │
└──────────────────────┘      └─────────────────────┘
```

### 核心组件

| 组件 | 功能 | 版本建议 |
|------|------|----------|
| **SLURM** | 作业调度系统 | >= 21.08 |
| **Munge** | 认证服务 | >= 0.5.14 |
| **NFS** | 共享存储 | >= 4.1 |
| **NIS** | 用户管理 | >= 3.1 |
| **Ganglia** | 性能监控 | >= 3.7 |
| **OpenMPI** | 并行计算 | >= 4.0 |

---

## 📦 环境准备

### 系统要求

```bash
# 操作系统
Ubuntu 20.04 LTS / CentOS 8 / RHEL 8

# 最低配置
CPU: 8核心
内存: 16 GB
磁盘: 100 GB
网络: 千兆以太网

# 推荐配置
CPU: 16核心+
内存: 32 GB+
磁盘: 500 GB SSD
网络: 万兆以太网
```

### 前置检查清单

- [ ] 所有节点系统时间同步（NTP）
- [ ] 防火墙规则已配置
- [ ] SELinux 已调整或关闭
- [ ] 系统内核参数已优化
- [ ] 网络连通性测试通过

---

## 🌐 网络配置

### 步骤 1️⃣ : 配置无密码 SSH

**生成 SSH 密钥**（普通用户）：

```bash
# 在管理节点执行
ssh-keygen -t rsa -b 4096 -C "cluster-admin"

# 分发公钥到所有节点
sshpass -p "password" ssh-copy-id -o StrictHostKeyChecking=no \
    -i ~/.ssh/id_rsa.pub username@node_ip
```

> [!NOTE] 💡
> **关键提示**：
> - 必须使用**普通用户**生成密钥，**禁止使用 root**
> - 建议使用 Ed25519 算法（更安全、更快）
> - 生产环境建议配置 SSH 密钥过期时间

**批量分发脚本**：

```bash
#!/bin/bash
# deploy_ssh_keys.sh
NODES=("node1" "node2" "node3")
PASSWORD="your_password"
USER="hpc"

for node in "${NODES[@]}"; do
    sshpass -p "$PASSWORD" ssh-copy-id -o StrictHostKeyChecking=no \
        -i ~/.ssh/id_rsa.pub ${USER}@${node}
    echo "✅ SSH key deployed to $node"
done
```

---

### 步骤 2️⃣ : 配置静态 IP 和主机名

**批量配置脚本**：

```bash
#!/bin/bash
# configure_network.sh
IPS=("172.26.96.117" "172.26.96.118" "172.26.96.119")
HOSTNAMES=("node1" "node2" "node3")
NEW_IPS=("192.168.1.201" "192.168.1.202" "192.168.1.203")
GATEWAY="192.168.1.1"
DNS_SERVERS=("8.8.8.8" "8.8.4.4")
INTERFACE="ens33"  # 根据实际情况修改

for i in "${!IPS[@]}"; do
    IP=${IPS[$i]}
    HOSTNAME=${HOSTNAMES[$i]}
    NEW_IP=${NEW_IPS[$i]}

    echo "🔧 Configuring $HOSTNAME ($IP -> $NEW_IP)"

    # 设置主机名
    ssh root@$IP "hostnamectl set-hostname $HOSTNAME"

    # 更新 /etc/hosts
    ssh root@$IP "echo '$NEW_IP $HOSTNAME' >> /etc/hosts"

    # 配置静态 IP（Netplan）
    ssh root@$IP "cat <<EOF > /etc/netplan/01-netcfg.yaml
network:
  version: 2
  ethernets:
    $INTERFACE:
      dhcp4: no
      addresses: [$NEW_IP/24]
      gateway4: $GATEWAY
      nameservers:
        addresses: [${DNS_SERVERS[@]}]
EOF"

    # 应用配置
    ssh root@$IP "netplan apply"

    echo "✅ $HOSTNAME configured successfully"
    echo ""
done
```

> [!IMPORTANT] ⚠️
> **重要警告**：
> - 修改网络配置前，建议先测试脚本
> - 确保网络接口名称（INTERFACE）正确
> - 保留至少一个 SSH 会话以防止配置失败导致无法连接

---

### 步骤 3️⃣ : 验证网络配置

**连通性测试**：

```bash
#!/bin/bash
# test_network.sh

# 测试节点间连通性
for node in node1 node2 node3; do
    ping -c 3 $node && echo "✅ $node reachable" || echo "❌ $node unreachable"
done

# 测试 SSH 连接
for node in node1 node2 node3; do
    ssh $node "hostname && uptime"
done
```

---

## 💾 存储配置

### 步骤 1️⃣ : 安装 NFS 服务器

```bash
# 在管理节点安装
sudo apt-get update
sudo apt-get install -y nfs-kernel-server

# 创建共享目录
sudo mkdir -p /opt/shared
sudo chown nobody:nogroup /opt/shared
sudo chmod 777 /opt/shared
```

---

### 步骤 2️⃣ : 配置 NFS 导出

```bash
# 配置导出规则
sudo tee -a /etc/exports <<EOF
# NFS 导出配置
/opt/shared 192.168.1.0/24(rw,sync,no_subtree_check,no_root_squash)
/home 192.168.1.0/24(rw,sync,no_subtree_check,no_root_squash)
/data 192.168.1.0/24(rw,sync,no_subtree_check,no_root_squash)
EOF

# 应用配置
sudo exportfs -ra
sudo systemctl restart nfs-kernel-server
sudo systemctl enable nfs-kernel-server
```

**NFS 导出选项说明**：

| 选项 | 说明 | 推荐场景 |
|------|------|----------|
| `rw` | 读写权限 | 高性能计算 |
| `ro` | 只读权限 | 软件分发 |
| `sync` | 同步写入 | 数据安全优先 |
| `async` | 异步写入 | 性能优先 |
| `no_root_squash` | 保持 root 权限 | 管理节点 |
| `root_squash` | 映射 root 为 nfsnobody | 计算节点 |

> [!TIP] 🚀
> **性能优化建议**：
> - 对于大数据传输，使用 `async` 提升性能
> - 调整 `rsize` 和 `wsize` 参数（建议 1MB）
> - 考虑使用 NFS v4.1 以获得更好的性能和并行能力

---

### 步骤 3️⃣ : 客户端挂载

```bash
#!/bin/bash
# mount_nfs.sh
MOUNT_POINTS=(
    "/opt/shared:管理节点IP:/opt/shared"
    "/home:管理节点IP:/home"
    "/data:管理节点IP:/data"
)

for mount_point in "${MOUNT_POINTS[@]}"; do
    LOCAL_DIR="${mount_point%%:*}"
    NFS_PATH="${mount_point##*:}"

    # 创建挂载点
    sudo mkdir -p $LOCAL_DIR

    # 测试挂载
    sudo mount -t nfs $NFS_PATH $LOCAL_DIR

    # 添加到 /etc/fstab
    if ! grep -q "$LOCAL_DIR" /etc/fstab; then
        echo "$NFS_PATH $LOCAL_DIR nfs defaults,rsize=1048576,wsize=1048576,timeo=600 0 0" | \
            sudo tee -a /etc/fstab
    fi

    echo "✅ Mounted $LOCAL_DIR"
done
```

> [!WARNING] ⚡
> **关键注意**：
> - 确保挂载点目录存在且权限正确
> - 生产环境建议在 `/etc/fstab` 中配置自动挂载
> - 使用 `soft` 或 `hard` 选项控制挂载失败行为

---

## 👥 用户管理

### 步骤 1️⃣ : 配置 NIS 服务器

```bash
# 在管理节点安装 NIS
sudo apt-get update
sudo apt-get install -y nis

# 设置 NIS domain
echo "cluster.local" | sudo tee /etc/defaultdomain
sudo hostnamectl set-hostname master.cluster.local

# 配置 NIS 服务器模式
sudo sed -i 's/NISSERVER=false/NISSERVER=master/' /etc/default/nis

# 配置 yp.conf
echo "domain cluster.local server master.cluster.local" | \
    sudo tee /etc/yp.conf

# 初始化 NIS 数据库
sudo /usr/lib/yp/ypinit -m

# 启动服务
sudo systemctl restart ypserv ypbind
sudo systemctl enable ypserv ypbind
```

---

### 步骤 2️⃣ : 配置 NIS 客户端

```bash
#!/bin/bash
# configure_nis_client.sh
NIS_DOMAIN="cluster.local"
NIS_SERVER="master.cluster.local"

# 安装 NIS 客户端
sudo apt-get install -y nis

# 设置 domain
echo "$NIS_DOMAIN" | sudo tee /etc/defaultdomain

# 配置 yp.conf
echo "domain $NIS_DOMAIN server $NIS_SERVER" | \
    sudo tee /etc/yp.conf

# 配置 nsswitch.conf
sudo sed -i 's/^passwd:.*/passwd:     files nis/' /etc/nsswitch.conf
sudo sed -i 's/^group:.*/group:      files nis/' /etc/nsswitch.conf
sudo sed -i 's/^shadow:.*/shadow:     files nis/' /etc/nsswitch.conf

# 重启服务
sudo systemctl restart ypbind
sudo systemctl enable ypbind

# 验证连接
ypwhich
echo "✅ NIS client configured"
```

---

### 步骤 3️⃣ : 测试 NIS

```bash
# 在管理节点创建测试用户
sudo adduser testuser

# 更新 NIS 数据库
cd /var/yp
sudo make

# 在客户端验证
getent passwd testuser
ypcat passwd | grep testuser
```

---

## 🔐 认证配置

### 步骤 1️⃣ : 配置 Munge 认证

```bash
# 在管理节点安装 Munge
sudo apt-get install -y munge libmunge-dev munge-plugins

# 生成 Munge 密钥
sudo dd if=/dev/urandom bs=1 count=1024 | \
    sudo tee /etc/munge/munge.key > /dev/null

# 设置密钥权限
sudo chown -R munge:munge /etc/munge /var/lib/munge /var/log/munge /var/run/munge
sudo chmod 400 /etc/munge/munge.key
sudo chmod 700 /etc/munge /var/lib/munge /var/log/munge /var/run/munge

# 启动服务
sudo systemctl restart munge
sudo systemctl enable munge

# 测试 Munge
munge -n | unmunge
echo "✅ Munge is working"
```

---

### 步骤 2️⃣ : 分发 Munge 密钥

```bash
#!/bin/bash
# distribute_munge_key.sh
NODES=("node1" "node2" "node3")

# 在所有节点安装 Munge
for node in "${NODES[@]}"; do
    ssh $node "sudo apt-get install -y munge libmunge-dev munge-plugins"
done

# 分发密钥
for node in "${NODES[@]}"; do
    # 复制密钥
    sudo scp /etc/munge/munge.key root@$node:/etc/munge/munge.key

    # 设置权限
    ssh root@$node "chown -R munge:munge /etc/munge /var/lib/munge /var/log/munge /var/run/munge"
    ssh root@$node "chmod 400 /etc/munge/munge.key"
    ssh root@$node "chmod 700 /etc/munge /var/lib/munge /var/log/munge /var/run/munge"

    # 启动服务
    ssh root@$node "systemctl restart munge"
    ssh root@$node "systemctl enable munge"

    echo "✅ Munge configured on $node"
done
```

> [!CAUTION] 🔥
> **重要警告**：
> - **Munge 密钥必须在所有节点上完全相同**
> - 密钥文件权限必须是 `400`
> - 确保 Munge 用户和组权限正确
> - 分发密钥后立即删除传输副本

---

## ⚙️ 作业调度系统

### 步骤 1️⃣ : 安装 SLURM

```bash
# 添加 SLURM 仓库（Ubuntu）
sudo apt-get install -y wget gnupg
wget -O- https://download.slurm.slurm.ie.key | sudo apt-key add -
echo "deb https://download.slurm.ie/slurm/slurm.git-ubuntu $(lsb_release -c -s) main" | \
    sudo tee /etc/apt/sources.list.d/slurm.list

# 安装 SLURM
sudo apt-get update
sudo apt-get install -y slurm-wlm slurm-wlm-docs
```

---

### 步骤 2️⃣ : 配置 SLURM

**创建配置文件 `/etc/slurm-llnl/slurm.conf`**：

```bash
# 基础配置
ClusterName=hpc-cluster
SlurmctldPort=6817
SlurmdPort=6818
SlurmdSpoolDir=/var/spool/slurm/d
StateSaveLocation=/var/spool/slurm/ctld
SlurmctldPidFile=/var/run/slurmctld.pid
SlurmdPidFile=/var/run/slurmd.pid

# 认证配置
AuthType=auth/munge
CryptoType=crypto/munge

# 调度器配置
SchedulerType=sched/backfill
SelectType=select/cons_tres
SelectTypeParameters=CR_Core

# 日志配置
SlurmctldDebug=info
SlurmctldLogFile=/var/log/slurm/slurmctld.log
SlurmdDebug=info
SlurmdLogFile=/var/log/slurm/slurmd.log

# 节点配置
NodeName=node[1-3] CPUs=16 RealMemory=64000 State=UNKNOWN
PartitionName=normal Nodes=node[1-3] Default=YES MaxTime=INFINITE State=UP
```

**配置说明**：

| 参数 | 说明 | 推荐值 |
|------|------|--------|
| `SchedulerType` | 调度器类型 | `sched/backfill` |
| `SelectType` | 资源选择类型 | `select/cons_tres` |
| `SelectTypeParameters` | 选择参数 | `CR_Core` (按核心) |
| `MaxTime` | 最大作业时长 | `INFINITE` 或 `7-00:00:00` |

---

### 步骤 3️⃣ : 启动 SLURM 服务

```bash
# 在管理节点
sudo mkdir -p /var/spool/slurm/ctld
sudo chown slurm:slurm /var/spool/slurm/ctld

sudo systemctl start slurmctld
sudo systemctl enable slurmctld

# 在计算节点
sudo mkdir -p /var/spool/slurm/d
sudo chown slurm:slurm /var/spool/slurm/d

sudo systemctl start slurmd
sudo systemctl enable slurmd

# 验证状态
sinfo
scontrol show nodes
```

> [!TIP] 💡
> **验证命令**：
> ```bash
> # 查看集群状态
> sinfo
>
> # 查看节点详情
> scontrol show nodes
>
> # 测试提交作业
> srun -N 1 hostname
> ```

---

## 📊 监控告警

### 步骤 1️⃣ : 安装 Ganglia

```bash
# 管理节点
sudo apt-get install -y ganglia-monitor gmetad ganglia-webfrontend

# 计算节点
sudo apt-get install -y ganglia-monitor
```

---

### 步骤 2️⃣ : 配置 Ganglia

**管理节点 `/etc/ganglia/gmetad.conf`**：

```bash
data_source "hpc cluster" 60 localhost
gridname "HPC Cluster"
```

**计算节点 `/etc/ganglia/gmond.conf`**：

```bash
cluster {
  name = "hpc cluster"
  owner = "hpc"
 latlong = "unspecified"
  url = "unspecified"
}

udp_send_channel {
  host = master.cluster.local
  port = 8649
  ttl = 1
}

udp_recv_channel {
  port = 8649
}
```

---

### 步骤 3️⃣ : 启动服务

```bash
# 管理节点
sudo systemctl restart gmetad ganglia-monitor
sudo systemctl enable gmetad ganglia-monitor
sudo systemctl restart apache2

# 计算节点
sudo systemctl restart ganglia-monitor
sudo systemctl enable ganglia-monitor

# 访问 Web 界面
# http://管理节点IP/ganglia
```

---

## 🔒 安全加固

### 1️⃣ : 限制 SSH 访问

```bash
# 编辑 /etc/ssh/sshd_config
Port 22
Protocol 2
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
AllowUsers hpc admin
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2

sudo systemctl restart sshd
```

---

### 2️⃣ : 配置防火墙

```bash
#!/bin/bash
# configure_firewall.sh

# 启用 UFW
sudo ufw --force enable

# 允许本地网络
sudo ufw allow from 192.168.1.0/24

# 允许必要端口
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 6817/tcp    # SLURM ctld
sudo ufw allow 6818/tcp    # SLURM d
sudo ufw allow 8649/tcp    # Ganglia
sudo ufw allow 2049/tcp    # NFS

# 拒绝其他连接
sudo ufw default deny incoming
sudo ufw default allow outgoing

# 查看规则
sudo ufw status numbered
```

---

### 3️⃣ : 启用审计日志

```bash
# 安装 auditd
sudo apt-get install -y auditd

# 配置审计规则
sudo tee -a /etc/audit/auditd.rules <<EOF
# 监控 SSH 登录
-w /var/log/auth.log -p wa -k ssh_logins

# 监控用户管理
-w /etc/passwd -p wa -k identity
-w /etc/group -p wa -k identity
-w /etc/shadow -p wa -k identity

# 监控 SLURM 配置
-w /etc/slurm-llnl/ -p wa -k slurm_config
EOF

sudo systemctl restart auditd
sudo systemctl enable auditd
```

---

## ⚡ 性能调优

### 1️⃣ : 系统内核参数优化

```bash
# 编辑 /etc/sysctl.conf
sudo tee -a /etc/sysctl.conf <<EOF
# 网络性能优化
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.ipv4.tcp_rmem = 4096 87380 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216
net.core.netdev_max_backlog = 30000

# 文件描述符限制
fs.file-max = 1000000

# 共享内存
kernel.shmmax = 68719476736
kernel.shmall = 4294967296
EOF

sudo sysctl -p
```

---

### 2️⃣ : SLURM 调度器优化

```bash
# 在 slurm.conf 中添加
SchedulerType=sched/backfill
SelectTypeParameters=CR_Core_Memory
DefMemPerCPU=4096
MaxMemPerCPU=8192

# 配置 QoS
sacctmgr -i create qos normal priority=100
sacctmgr -i create qos high priority=500
sacctmgr -i create qos debug priority=10

# 配置公平共享
sacctmgr -i create account research
sacctmgr -i create account production
```

---

### 3️⃣ : NFS 性能优化

```bash
# 服务器端 /etc/default/nfs-kernel-server
RPCNFSDOPTS="--nfs-version 4.1 --debug"
RPCMOUNTDOPTS="--manage-gids -N 2 -V 3"

# 客户端挂载选项
man_node_ip:/opt/shared /opt/shared nfs \
    rw,hard,intr,rsize=1048576,wsize=1048576,timeo=600,noatime,nodiratime 0 0
```

---

## 🧪 测试验证

### MPI 并行测试

```bash
# 安装 OpenMPI
sudo apt-get install -y openmpi-bin openmpi-common libopenmpi-dev

# 创建测试程序
cat > hello_world.c <<'EOF'
#include <mpi.h>
#include <stdio.h>

int main(int argc, char** argv) {
    MPI_Init(NULL, NULL);

    int world_size;
    MPI_Comm_size(MPI_COMM_WORLD, &world_size);

    int world_rank;
    MPI_Comm_rank(MPI_COMM_WORLD, &world_rank);

    char processor_name[MPI_MAX_PROCESSOR_NAME];
    int name_len;
    MPI_Get_processor_name(processor_name, &name_len);

    printf("Hello world from processor %s, rank %d out of %d processors\n",
           processor_name, world_rank, world_size);

    MPI_Finalize();
    return 0;
}
EOF

# 编译
mpicc hello_world.c -o hello_world

# 运行测试
mpirun -np 4 -host node1,node2,node3 ./hello_world
```

---

### SLURM 作业测试

```bash
# 创建提交脚本
cat > test_job.sh <<'EOF'
#!/bin/bash
#SBATCH --job-name=test_job
#SBATCH --output=test_job.out
#SBATCH --error=test_job.err
#SBATCH --nodes=2
#SBATCH --ntasks=4
#SBATCH --time=00:05:00
#SBATCH --partition=normal

echo "Job started at $(date)"
echo "Running on $(hostname)"
srun -n 4 hostname
echo "Job finished at $(date)"
EOF

# 提交作业
sbatch test_job.sh

# 查看作业状态
squeue -u $USER

# 查看输出
cat test_job.out
```

---

## 📚 常见问题排查

### 问题 1: SLURM 作业失败

**症状**：作业提交后状态为 `FAILED`

**排查步骤**：

```bash
# 查看作业详情
scontrol show job <job_id>

# 查看节点状态
sinfo -Nel

# 查看日志
sudo tail -f /var/log/slurm/slurmctld.log
sudo journalctl -u slurmd -f
```

**常见原因**：
- ❌ 资源请求超过节点可用资源
- ❌ 认证失败（Munge 密钥不匹配）
- ❌ 文件系统挂载问题

---

### 问题 2: NFS 性能慢

**症状**：集群性能低于预期

**优化措施**：

```bash
# 调整 NFS 挂载选项
sudo mount -o remount,rsize=1048576,wsize=1048576,noatime /opt/shared

# 使用 NFS v4.1
man_node:/data /data nfs vers=4.1,rw,hard,intr 0 0

# 检查网络带宽
iperf -s  # 服务器端
iperf -c server_ip  # 客户端
```

---

### 问题 3: 节点失联

**症状**：节点状态为 `DOWN`

**排查步骤**：

```bash
# 测试网络连通性
ping <node_ip>

# 测试 SSH
ssh <node_hostname> "uptime"

# 检查 SLURM 服务
ssh <node_hostname> "systemctl status slurmd"

# 恢复节点
scontrol update NodeName=<node> State=IDLE
```

---

## 🎓 总结

完成本教程后，你将拥有：

✅ **生产级 HPC 集群**
✅ **完整的作业调度系统**
✅ **实时性能监控**
✅ **企业级安全配置**
✅ **性能优化最佳实践**

### 下一步

- 🔬 部署容器化应用（Singularity）
- 📈 集成 Prometheus + Grafana
- 🚀 配置 GPU 资源调度
- 🔒 实现 LDAP 认证集成

---

## 📞 获取帮助

> ⚡ **LUTRA LABS** - 高性能计算与集群管理
>
> 📧 技术支持: lutra@example.com
> 💬 GitHub Issues: [提交问题](https://github.com/Lutra23/zous.github.io/issues)
> 📖 官方文档: [SLURM](https://slurm.schedmd.com/) | [Ganglia](http://ganglia.info/)

---

**🏷️ 标签**: #HPC #SLURM #集群管理 #高性能计算 #Linux #运维
