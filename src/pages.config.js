import Suppliers from './pages/Suppliers';
import SupplierForm from './pages/SupplierForm';
import SupplierDetail from './pages/SupplierDetail';
import Clients from './pages/Clients';
import ClientForm from './pages/ClientForm';
import ClientDetail from './pages/ClientDetail';
import Projects from './pages/Projects';
import ProjectForm from './pages/ProjectForm';
import BankAccounts from './pages/BankAccounts';
import BankAccountForm from './pages/BankAccountForm';
import CostCenters from './pages/CostCenters';
import CostCenterForm from './pages/CostCenterForm';
import AccountsPayable from './pages/AccountsPayable';
import AccountPayableForm from './pages/AccountPayableForm';
import AccountsReceivable from './pages/AccountsReceivable';
import AccountReceivableForm from './pages/AccountReceivableForm';
import Transactions from './pages/Transactions';
import Dashboard from './pages/Dashboard';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import BankAccountDetail from './pages/BankAccountDetail';
import ProjectDetail from './pages/ProjectDetail';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Suppliers": Suppliers,
    "SupplierForm": SupplierForm,
    "SupplierDetail": SupplierDetail,
    "Clients": Clients,
    "ClientForm": ClientForm,
    "ClientDetail": ClientDetail,
    "Projects": Projects,
    "ProjectForm": ProjectForm,
    "BankAccounts": BankAccounts,
    "BankAccountForm": BankAccountForm,
    "CostCenters": CostCenters,
    "CostCenterForm": CostCenterForm,
    "AccountsPayable": AccountsPayable,
    "AccountPayableForm": AccountPayableForm,
    "AccountsReceivable": AccountsReceivable,
    "AccountReceivableForm": AccountReceivableForm,
    "Transactions": Transactions,
    "Dashboard": Dashboard,
    "Reports": Reports,
    "Settings": Settings,
    "BankAccountDetail": BankAccountDetail,
    "ProjectDetail": ProjectDetail,
}

export const pagesConfig = {
    mainPage: "Suppliers",
    Pages: PAGES,
    Layout: __Layout,
};