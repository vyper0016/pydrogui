# N = 15 dynamic instructions (K=1, pad=0)
addi t1, x0, 0
addi t2, x0, 0
addi t3, x0, 0
lui  t0, 0
addi t0, t0, 1
loop:
addi t1, t1, 1
xor  t2, t2, t1
add  t3, t3, t2
slli t4, t1, 1
srli t5, t4, 1
sub  t6, t3, t5
addi t0, t0, -1
bne  t0, x0, loop
addi a7, x0, 93
ecall
