```markdown
# 1. 设置无密码登录静态 IP 以及修改 hosts 与 hostname

首先，确保你的 DHCP 服务器正在运行，并且可以通过它来查看分配给节点的 IP 地址。  
接着，在主管理节点（假设为 master 节点）上生成一个 SSH 密钥对：

```bash
ssh-keygen -t rsa -b 2048
```

这是为 master 用户生成的 SSH 密钥对，而不是 root 用户的密钥。

分发公钥到各个节点以便无密码登录：

```bash
sshpass -p 节点登录密码 ssh-copy-id -i ~/.ssh/id_rsa.pub username@节点ip
```

其中 `username` 是节点上的用户名，`节点ip` 是你要连接的节点的 IP 地址。

### 批量修改节点 IP 地址和主机名的脚本示例：

```bash
#!/bin/bash
IPS=("172.26.96.117" "172.26.96.118" "172.26.96.119") # 当前的节点 IP 地址
HOSTNAMES=("node1" "node2" "node3") # 对应的主机名
NEW_IPS=("192.168.1.201" "192.168.1.202" "192.168.1.203") # 对应的新静态 IP 地址

for i in "${!IPS[@]}"; do 
   IP=${IPS[$i]} 
   HOSTNAME=${HOSTNAMES[$i]} 
   NEW_IP=${NEW_IPS[$i]}
   
   ssh root@$IP "hostnamectl set-hostname $HOSTNAME"
   ssh root@$IP "echo '$NEW_IP $HOSTNAME' >> /etc/hosts"

   # 配置静态 IP 地址（根据你的系统使用适当的配置方式，以下是 netplan 配置的示例）
   ssh root@$IP "cat <<EOF > /etc/netplan/01-netcfg.yaml
   network:
     version: 2
     ethernets:
       ens33:  # 替换为你的网卡名称
         dhcp4: no
         addresses: [$NEW_IP/24]
         gateway4: 192.168.1.1  # 替换为你的网关
         nameservers:
           addresses: [8.8.8.8, 8.8.4.4]
   EOF"

   ssh root@$IP "netplan apply"
done
```

---

# 2. 安装和配置 NFS：使用 nfs-kernel-server 和 nfs-common 包设置 NFS 服务器，为节点间提供共享存储

打开终端，使用以下命令安装 NFS 服务器端和客户端：

```bash
# 在 master 主机
sudo apt-get install nfs-kernel-server
```

```bash
# 在节点机
sudo apt-get install nfs-common
```

## 配置 NFS 共享目录

`/opt` 是要共享的文件夹，`172.16.0.0/24` 是能够连到 master 主机的网络范围。

```bash
echo "/opt 172.16.0.0/24(rw,sync,no_root_squash)" | sudo tee -a /etc/exports
```

### 重启 NFS 服务，并确保它设置为开机自启：

```bash
sudo systemctl restart nfs-kernel-server
sudo exportfs -ra
sudo systemctl enable nfs-kernel-server
```

### 在客户端验证并挂载 NFS 共享

```bash
showmount -e master IP地址
sudo mount -t nfs IP地址:/opt /opt  # 挂载 master 的 /opt 文件夹至节点机的 /opt 文件夹
```

### 为了使挂载持久化，需要在客户端的 `/etc/fstab` 文件中添加以下行：

```bash
172.16.0.11:/opt /opt nfs defaults 0 0
```

---

# 3. 设置 NIS（网络信息服务）来管理用户账户

安装 NIS：

```bash
sudo apt install nis
```

### 配置 NIS 服务器：

编辑 `/etc/default/nis` 文件，确保启用 NIS 服务，设置 `NISSERVER=true`。

### 配置 NIS 域名：

在 `/etc/yp.conf` 中设置你的 NIS 域，在 yp.conf 中增加如下：

```bash
domain master的hostname server master的ip地址
```

### 使用以下命令创建 NIS 域：

```bash
sudo ypdomainname master的hostname
```

生成 `/etc/defaultdomain`，并确保此文件里只有 master 的 hostname。

### 编辑 `/etc/nsswitch.conf`，调整此文件以使用 NIS 进行用户信息查询：

修改如下：

```bash
passwd: files nis
group: files nis
shadow: files nis
```

### 在 NIS 服务器上重新初始化 NIS 数据库：

```bash
sudo /usr/lib/yp/ypinit -m
```

当提示输入主机名时，输入 master 主机名 `hostname`，然后按 `Ctrl+D` 结束输入。

### 启动 NIS 服务：

```bash
sudo systemctl start ypserv
sudo systemctl start ypbind
```

### 检查 NIS 服务状态，确保服务正常运行：

```bash
sudo systemctl status ypserv
sudo systemctl status ypbind
```

## 客户端配置

编辑 `/etc/yp.conf` 文件，在客户端 NOVA 上编辑 `/etc/yp.conf` 文件，配置 NIS 服务器：

```bash
domain master的hostname server master的ip地址
```

### 在节点机上设置默认域名：

```bash
echo "master的hostname" | sudo tee /etc/defaultdomain
```

### 启动 NIS 绑定服务：

```bash
sudo systemctl start ypbind
```

### 确保客户端正确绑定到 NIS 域：

```bash
sudo systemctl status ypbind
```

### 使用 `ypcat` 命令测试是否能从 NIS 服务器获取数据：

```bash
sudo ypcat passwd
```

---

# 4. 安装 Munge

在所有节点上（包括所有计算节点和管理节点），使用以下命令安装 Munge：

```bash
sudo yum install munge
sudo yum install munge-devel
```

### 在管理节点生成 Munge 密钥

```bash
sudo create-munge-key
```

### 复制秘钥到节点用户文件夹

```bash
sudo scp /etc/munge/munge.key user@node:/home/user/munge.key
sudo mv /home/user/munge.key /etc/munge
```

### 在所有节点上启动 Munge 服务并设置为开机自启：

```bash
sudo systemctl start munge
sudo systemctl enable munge
```

### 确保 UID 和 GID 一致

Munge 的操作依赖于一致的用户和组 ID (UID 和 GID)。确保在所有节点上，munge 用户和组的 UID 和 GID 是一致的。

在所有节点上，运行以下命令检查 munge 用户和组的 UID 和 GID：

```bash
id munge
```

### 同步 UID 和 GID

如果发现 UID 和 GID 不一致，你可以手动同步它们。比如，如果你发现 munge 用户的 UID 和 GID 不一致，你可以通过修改 `/etc/passwd` 和 `/etc/group` 文件来同步。

在管理节点上：

```bash
sudo usermod -u 1234 munge
sudo groupmod -g 1234 munge
```

在所有其他节点上执行相同的操作，确保 UID 和 GID 一致。

### 确保 Munge 服务正在运行，并且配置正确。在所有节点上运行：

```bash
munge -n
```

这个命令应该返回一个加密的凭证而没有错误信息。

```bash
sudo systemctl start munge
# 查看是否连通（这一步验证不过，报错 unmunge: Error: Invalid credential，重启对端 munge 服务即可）
munge -n | ssh node0 unmunge
```

---

# 5. Slurm 的安装步骤

### 安装依赖的软件包

最好从 GitHub 上下载 Slurm 的安装包 [[Slurm GitHub](https://github.com/SchedMD/slurm/)](https://github.com/SchedMD/slurm/)

### 首先，在 `/opt` 文件夹里解压这个 ZIP 文件：

```bash
unzip slurm-master.zip
```

### 进入解压后的 SLURM 目录：

```bash
cd slurm-master
```

### 编译和安装 SLURM

```bash
./configure
make
```

### 安装 SLURM 到系统目录：

```bash
sudo make install
```

slurmd: 完成计算节点的任务（启动任务、监控任务、分层通信）  
slurmctld: 完成管理节点的任务（故障切换、资源监控、队列管理、作业调度）

```bash
sudo apt update
sudo apt install slurm-wlm
# `slurmd`: compute node daemon
sudo apt install slurmctld  # `slurmctld`: central management daemon
```

### 找到 `slurm-wlm-configurator.html` 文件，进入该目录下输入以下命令：

```bash
dp

kg -i slurm-wlm-configurator_21.08.7-1_amd64.deb
```

```markdown
# 6. 配置 Slurm

### 配置管理节点

在管理节点上配置 Slurm 控制守护进程 `slurmctld`：

1. **创建 Slurm 配置文件**  
   Slurm 的配置文件通常位于 `/etc/slurm-llnl/slurm.conf`。您可以使用 `scontrol` 工具来生成配置文件，也可以手动编辑配置。

   使用以下命令生成 Slurm 配置文件：

   ```bash
   scontrol create slurm.conf
   ```

   或者直接手动创建并编辑 `/etc/slurm-llnl/slurm.conf`，例如：

   ```bash
   ClusterName=your-cluster-name
   SlurmdPort=7003
   SlurmctldPort=7002
   SlurmdPort=7003
   SlurmdAddr=YOUR_MANAGEMENT_NODE_IP
   SlurmdPidFile=/var/run/slurmd.pid
   SlurmctldPidFile=/var/run/slurmctld.pid
   SlurmdLogFile=/var/log/slurmd.log
   SlurmctldLogFile=/var/log/slurmctld.log
   SlurmdSocket=/var/run/slurmd.sock
   SlurmctldSocket=/var/run/slurmctld.sock
   ```

   配置文件设置包括集群名称、节点端口和日志文件位置等。

2. **启动 Slurm 服务**

   配置好后，启动 Slurm 控制守护进程：

   ```bash
   sudo systemctl start slurmctld
   sudo systemctl enable slurmctld
   ```

3. **配置计算节点**

   在每个计算节点上，需要配置 `slurmd` 守护进程：

   - 配置 `slurm.conf` 文件，并确保每个节点上的设置与管理节点一致。
   - 启动 `slurmd` 守护进程：

     ```bash
     sudo systemctl start slurmd
     sudo systemctl enable slurmd
     ```

4. **验证 Slurm 状态**

   确保所有服务都在运行，您可以使用以下命令来检查：

   ```bash
   scontrol show config
   sinfo
   ```

   这些命令将显示集群的状态，包括计算节点的可用性、作业的调度状态等。

---

# 7. 安装和配置 MPI（消息传递接口）

MPI 用于在计算节点之间进行并行计算，通常结合 Slurm 来执行分布式作业。

### 安装 Open MPI

在所有节点上安装 Open MPI：

```bash
sudo apt-get install openmpi-bin openmpi-common libopenmpi-dev
```

### 配置环境变量

在每个节点的 `.bashrc` 文件中配置 Open MPI 环境变量：

```bash
export PATH=/usr/lib/openmpi/bin:$PATH
export LD_LIBRARY_PATH=/usr/lib/openmpi/lib:$LD_LIBRARY_PATH
```

然后，重新加载 `.bashrc` 文件：

```bash
source ~/.bashrc
```

### 测试 MPI 安装

在所有节点上运行简单的 MPI 测试程序来验证安装：

```bash
mpirun -np 4 hello_world
```

确保输出没有错误并且显示每个进程的 ID。

---

# 8. 安装并配置 Ganglia（集群监控）

### 安装 Ganglia

在管理节点上安装 Ganglia 的监控工具：

```bash
sudo apt-get install ganglia-monitor gmetad ganglia-webfrontend
```

然后安装 Ganglia 监控客户端：

```bash
sudo apt-get install ganglia-monitor
```

### 配置 Ganglia

配置监控服务器和客户端的配置文件：

- **在管理节点上配置 gmetad**  
   编辑 `/etc/ganglia/gmetad.conf` 文件，确保它配置了正确的 IP 地址和端口。

- **配置客户端**  
   在每个计算节点上编辑 `/etc/ganglia/gmond.conf` 文件，确保它能够与管理节点进行通信。

```bash
udp_send_channel {
  host = 管理节点 IP
  port = 8649
}
```

### 启动 Ganglia 服务

启动 `gmetad` 和 `gmond` 服务：

```bash
sudo systemctl start gmetad
sudo systemctl enable gmetad
sudo systemctl start ganglia-monitor
sudo systemctl enable ganglia-monitor
```

### 配置 Ganglia Web 前端

启动 Web 服务器来访问监控界面：

```bash
sudo systemctl start apache2
sudo systemctl enable apache2
```

访问 `http://管理节点 IP/ganglia`，即可查看集群状态和性能指标。

---

# 9. 配置作业调度与负载平衡

### 作业调度

配置 Slurm 后，您可以通过 `srun` 命令来调度作业。例如，提交一个使用 4 个节点并行计算的作业：

```bash
srun -n 4 --mpi=pmi2 ./your_mpi_program
```

这将启动一个 MPI 程序，使用 4 个节点并行计算。

### 负载平衡

Slurm 会根据计算节点的负载情况自动进行负载平衡。例如，提交作业时，Slurm 会将作业分配到负载较低的节点。

如果您希望更精确地控制负载平衡，可以配置 Slurm 的 `partitions` 和 `job scheduling policies`，这将允许您设置作业的优先级和资源分配规则。

---

# 10. 性能调优与监控

对于大型集群，性能监控和调优至关重要。

- **监控系统性能**：使用 Ganglia 或其他工具（如 Prometheus）来实时监控 CPU 使用率、内存消耗、磁盘 I/O 等。
- **优化作业调度策略**：根据集群负载、作业优先级和计算资源配置优化作业调度策略。
- **资源分配**：使用 Slurm 的 `fairshare` 和 `quality of service (QoS)` 配置，确保资源的公平分配并限制恶意或低效作业的资源占用。

---

# 11. 集群安全性

确保集群的安全性是一个持续的任务。以下是一些基本的安全措施：

- **限制 SSH 访问**：确保只有经过授权的用户能够通过 SSH 连接到集群。
- **配置防火墙**：限制对管理节点和计算节点的网络访问，只允许特定的 IP 地址和端口。
- **启用审计日志**：确保所有操作和访问都被记录，以便日后审核。

