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
}

export const pagesConfig = {
    mainPage: "Suppliers",
    Pages: PAGES,
    Layout: __Layout,
};