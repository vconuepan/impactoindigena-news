import prisma from '../lib/prisma.js'
import { hashPassword, verifyPassword, revokeAllUserTokens } from './auth.js'
const userSelect = {
  id: true,
  email: true,
  name: true,
  userType: true,
  createdAt: true,
  updatedAt: true,
}

export async function createUser(data: {
  email: string
  name: string
  password: string
  userType?: import('@prisma/client').UserType
}) {
  const passwordHash = await hashPassword(data.password)
  return prisma.user.create({
    data: {
      email: data.email,
      name: data.name,
      passwordHash,
      userType: data.userType || 'VEEDOR',
    },
    select: userSelect,
  })
}

export async function getUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: userSelect,
  })
}

export async function getUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
  })
}

export async function listUsers() {
  return prisma.user.findMany({
    select: userSelect,
    orderBy: { createdAt: 'asc' },
  })
}

export async function updateUser(id: string, data: { email?: string; name?: string; userType?: import('@prisma/client').UserType }) {
  return prisma.user.update({
    where: { id },
    data,
    select: userSelect,
  })
}

// AQUI VIVIA `deleteUser(id)`, un `prisma.user.delete` a secas que dejaba el
// boletín, el contacto en Brevo, las alertas y los comentarios de la persona.
// Se borró el 3-nov-2026: el borrado de una cuenta es `suprimirPorCorreo`
// (services/supresion.ts), para que no vuelva a haber un camino incompleto.

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error('User not found')

  const valid = await verifyPassword(currentPassword, user.passwordHash)
  if (!valid) throw new Error('Current password is incorrect')

  const passwordHash = await hashPassword(newPassword)
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } })
  await revokeAllUserTokens(userId)
}

export async function resetPassword(userId: string, newPassword: string): Promise<void> {
  const passwordHash = await hashPassword(newPassword)
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } })
  await revokeAllUserTokens(userId)
}
