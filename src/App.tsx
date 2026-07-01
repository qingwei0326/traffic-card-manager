import { useState } from 'react'
import Layout from './components/Layout'
import Dashboard from './components/Dashboard'
import CardList from './components/CardList'
import CustomerList from './components/CustomerList'
import FinanceStats from './components/FinanceStats'
import Settings from './components/Settings'
import PlanList from './components/PlanList'
import CardPicker from './components/CardPicker'

export type Page = 'dashboard' | 'cards' | 'customers' | 'finance' | 'plans' | 'picker' | 'settings'

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard')
  const [refreshKey, setRefreshKey] = useState(0)
  const [openCardForm, setOpenCardForm] = useState(false)
  const [openCustomerForm, setOpenCustomerForm] = useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null)
  const [pickerProvince, setPickerProvince] = useState('')

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1)
  }

  const handleNavigateToAddCard = () => {
    setOpenCardForm(true)
    setCurrentPage('cards')
  }

  const handleNavigateToAddCustomer = () => {
    setOpenCustomerForm(true)
    setCurrentPage('customers')
  }

  const handleViewCustomer = (customerId: number) => {
    setSelectedCustomerId(customerId)
    setCurrentPage('customers')
  }

  const handleRecommendPlans = (province: string) => {
    setPickerProvince(province)
    setCurrentPage('picker')
  }

  const handleCardFormOpened = () => {
    setOpenCardForm(false)
  }

  const handleCustomerFormOpened = () => {
    setOpenCustomerForm(false)
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard key={refreshKey} onNavigate={setCurrentPage} onAddCard={handleNavigateToAddCard} onAddCustomer={handleNavigateToAddCustomer} onViewCustomer={handleViewCustomer} />
      case 'cards':
        return <CardList key={refreshKey} onRefresh={handleRefresh} openForm={openCardForm} onFormOpened={handleCardFormOpened} onViewCustomer={handleViewCustomer} />
      case 'customers':
        return <CustomerList key={refreshKey} onRefresh={handleRefresh} openForm={openCustomerForm} onFormOpened={handleCustomerFormOpened} selectedCustomerId={selectedCustomerId} onSelectionHandled={() => setSelectedCustomerId(null)} onRecommendPlans={handleRecommendPlans} />
      case 'finance':
        return <FinanceStats key={refreshKey} />
      case 'plans':
        return <PlanList key={refreshKey} />
      case 'picker':
        return <CardPicker key={refreshKey} initialProvince={pickerProvince} onProvinceUsed={() => setPickerProvince('')} />
      case 'settings':
        return <Settings key={refreshKey} onRefresh={handleRefresh} />
      default:
        return <Dashboard key={refreshKey} onNavigate={setCurrentPage} onAddCard={handleNavigateToAddCard} onAddCustomer={handleNavigateToAddCustomer} onViewCustomer={handleViewCustomer} />
    }
  }

  return (
    <Layout currentPage={currentPage} onNavigate={setCurrentPage}>
      {renderPage()}
    </Layout>
  )
}

export default App
