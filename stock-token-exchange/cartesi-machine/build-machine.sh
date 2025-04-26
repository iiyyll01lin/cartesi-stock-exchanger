#!/bin/bash
# Build script for the Stock Token Exchange Cartesi Machine

set -e

MACHINE_DIR=$(dirname $(readlink -f $0))
DAPP_FS_BIN=$MACHINE_DIR/offchain_logic.py
DAPP_FS=$MACHINE_DIR/stock-exchange-fs.ext2
TEMPLATE_HASH_FILE=$MACHINE_DIR/template-hash.txt

# Create a ext2 file system with our application
mkdir -p $MACHINE_DIR/tmp-fs
cp $DAPP_FS_BIN $MACHINE_DIR/tmp-fs/offchain_logic.py
chmod +x $MACHINE_DIR/tmp-fs/offchain_logic.py

echo "Generating ext2 filesystem with stock exchange logic..."
genext2fs -b 1024 -d $MACHINE_DIR/tmp-fs $DAPP_FS
rm -rf $MACHINE_DIR/tmp-fs

echo "Building Cartesi Machine for Stock Token Exchange..."
# Build machine (using reference from dogecoin example with modifications)
cartesi-machine \
    --max-mcycle=0 \
    --initial-hash \
    --append-rom-bootargs="single=yes console=hvc0 rootfstype=ext2 root=/dev/mtdblock0 rw quiet mtdparts=flash.0:-(rootfs) -- /bin/sh -c 'cd /mnt && /usr/bin/python3 /offchain_logic.py'" \
    --flash-drive="label:rootfs,filename:$DAPP_FS" \
    --ram-image=linux-5.5.19-ctsi-5.bin \
    --rom-image=rom.bin \
    --store="$MACHINE_DIR/stock-exchange-machine"

# Get the machine template hash and save it to file
template_hash=$(cartesi-machine-stored-hash $MACHINE_DIR/stock-exchange-machine | tail -n 1)
echo $template_hash > $TEMPLATE_HASH_FILE

echo "Cartesi Machine built successfully!"
echo "Template Hash: $template_hash"
echo "Hash saved to: $TEMPLATE_HASH_FILE"
echo
echo "Use this hash in your Exchange.sol contract and deployment script"
echo "The deployment script will automatically read this hash from the file."