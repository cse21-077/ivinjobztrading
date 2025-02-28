"use client"

import { useState, useEffect } from "react"
import { collection, query, getDocs, doc, updateDoc, deleteDoc, limit, startAfter, orderBy } from "firebase/firestore"
import { getAuth, signOut } from "firebase/auth"
import { db } from "@/lib/firebase"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface User {
  id: string
  firstName: string
  lastName: string
  email: string
  approved: boolean
  role: string
}

export default function AdminDashboard() {
  const [users, setUsers] = useState<User[]>([])
  const [pendingUsers, setPendingUsers] = useState<User[]>([])
  const [totalClients, setTotalClients] = useState(0)
  const [lastVisible, setLastVisible] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const PAGE_SIZE = 10

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    setLoading(true)
    const q = query(collection(db, "users"), orderBy("email"), limit(PAGE_SIZE))
    const querySnapshot = await getDocs(q)
    const fetchedUsers: User[] = []
    querySnapshot.forEach((doc) => {
      fetchedUsers.push({ id: doc.id, ...doc.data() } as User)
    })
    setUsers(fetchedUsers)
    setPendingUsers(fetchedUsers.filter((user) => !user.approved && user.role === "client"))
    setTotalClients(fetchedUsers.filter((user) => user.role === "client").length)
    setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1])
    setLoading(false)
  }

  const fetchMoreUsers = async () => {
    if (!lastVisible) return
    setLoading(true)
    const q = query(collection(db, "users"), orderBy("email"), startAfter(lastVisible), limit(PAGE_SIZE))
    const querySnapshot = await getDocs(q)
    const fetchedUsers: User[] = []
    querySnapshot.forEach((doc) => {
      fetchedUsers.push({ id: doc.id, ...doc.data() } as User)
    })
    setUsers([...users, ...fetchedUsers])
    setPendingUsers([...pendingUsers, ...fetchedUsers.filter((user) => !user.approved && user.role === "client")])
    setTotalClients(
      users.filter((user) => user.role === "client").length +
        fetchedUsers.filter((user) => user.role === "client").length,
    )
    setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1])
    setLoading(false)
  }

  const approveUser = async (userId: string) => {
    const userRef = doc(db, "users", userId)
    await updateDoc(userRef, { approved: true })
    setUsers(users.map((user) => (user.id === userId ? { ...user, approved: true } : user)))
    setPendingUsers(pendingUsers.filter((user) => user.id !== userId))
  }

  const rejectUser = async (userId: string) => {
    const userRef = doc(db, "users", userId)
    await deleteDoc(userRef)
    setUsers(users.filter((user) => user.id !== userId))
    setPendingUsers(pendingUsers.filter((user) => user.id !== userId))
    setTotalClients(totalClients - 1)
  }

  const revokeAccess = async (userId: string) => {
    const userRef = doc(db, "users", userId)
    await deleteDoc(userRef)
    setUsers(users.filter((user) => user.id !== userId))
    setPendingUsers(pendingUsers.filter((user) => user.id !== userId))
    setTotalClients(totalClients - 1)
  }

  const handleSignOut = async () => {
    const auth = getAuth()
    await signOut(auth)
    // Redirect to login page or handle post sign-out logic here
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Admin Dashboard</CardTitle>
        <CardDescription>Manage users and approvals</CardDescription>
        <Button onClick={handleSignOut} className="ml-auto">
          Sign Out
        </Button>
      </CardHeader>
      <CardContent>
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2">Mini Dashboard</h2>
          <p>Total Users with Client Role: {totalClients}</p>
        </div>
        <Tabs defaultValue="pending">
          <TabsList>
            <TabsTrigger value="pending">Pending Approvals</TabsTrigger>
            <TabsTrigger value="all">All Users</TabsTrigger>
          </TabsList>
          <TabsContent value="pending">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>{`${user.firstName} ${user.lastName}`}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>Pending</TableCell>
                    <TableCell>
                      <Button onClick={() => approveUser(user.id)} className="mr-2">
                        Approve
                      </Button>
                      <Button onClick={() => rejectUser(user.id)} variant="destructive">
                        Reject
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>
          <TabsContent value="all">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>{`${user.firstName} ${user.lastName}`}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{user.role}</TableCell>
                    <TableCell>{user.approved ? "Approved" : "Pending"}</TableCell>
                    <TableCell>
                      {user.role !== "admin" && (
                        <Button onClick={() => revokeAccess(user.id)} variant="destructive">
                          Revoke Access
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {lastVisible && (
              <div className="mt-4">
                <Button onClick={fetchMoreUsers} disabled={loading}>
                  {loading ? "Loading..." : "Load More"}
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

