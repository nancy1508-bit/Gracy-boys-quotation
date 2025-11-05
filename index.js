import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, collection, query, deleteDoc } from 'firebase/firestore';
import { Plus, LayoutDashboard, FileText, Trash2, Edit, Printer, ChevronLeft, Search } from 'lucide-react';

// --- Global Constants and Firebase Setup ---
// These global variables are provided by the canvas environment.
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Helper to convert Firebase timestamp to readable date
const formatDate = (timestamp) => {
    if (!timestamp) return new Date().toLocaleDateString('en-GB');
    if (timestamp.toDate) {
        return timestamp.toDate().toLocaleDateString('en-GB');
    }
    // Handle standard Date object or string
    return new Date(timestamp).toLocaleDateString('en-GB');
};

const getDefaultItem = () => ({
    id: crypto.randomUUID(),
    requirement: '',
    qty: 1,
    unitPrice: 0.00,
    remark: '',
    amount: 0.00, // Calculated
});

const getNewQuotation = (count = 0) => ({
    id: crypto.randomUUID(),
    clientName: 'New Client',
    companyName: '',
    address: '',
    contactNumber: '',
    // Use the maximum existing number + 1 for the new quote number
    quotationNumber: `QT-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`,
    dateIssued: formatDate(new Date()),
    validUntil: formatDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)), // 30 days later
    items: [getDefaultItem()],
    taxRate: 18, // Default 18% GST
    discount: 0,
    status: 'Draft',
    terms: 'Payment due within 30 days. 50% advance required.',
    notes: 'Additional notes or special instructions for the event.',
    createdAt: new Date(),
    subtotal: 0,
    grandTotal: 0,
});

// --- Custom Hook for Firebase Initialization and Auth ---

const useFirebase = () => {
    const [db, setDb] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);

    useEffect(() => {
        if (!Object.keys(firebaseConfig).length) {
            console.error("Firebase config is missing. Data persistence will not work.");
            setUserId(crypto.randomUUID());
            setIsAuthReady(true);
            return;
        }

        const app = initializeApp(firebaseConfig);
        const firestore = getFirestore(app);
        const authentication = getAuth(app);

        setDb(firestore);
        
        // This handles the initial sign-in logic (custom token or anonymous)
        const authenticateUser = async () => {
            try {
                if (initialAuthToken) {
                    const cred = await signInWithCustomToken(authentication, initialAuthToken);
                    setUserId(cred.user.uid);
                } else {
                    const cred = await signInAnonymously(authentication);
                    setUserId(cred.user.uid);
                }
            } catch (e) {
                console.error("Firebase authentication failed:", e);
                // Fallback to a unique ID if auth fails
                setUserId(crypto.randomUUID()); 
            } finally {
                setIsAuthReady(true);
            }
        };

        // We listen for changes to ensure we get the latest user ID
        const unsubscribe = onAuthStateChanged(authentication, (user) => {
            if (user) {
                setUserId(user.uid);
            } else {
                // If onAuthStateChanged fires before initial token is processed,
                // or if session expires, re-run auth.
                authenticateUser();
            }
        });

        authenticateUser();

        return () => unsubscribe();
    }, []);

    return { db, userId, isAuthReady };
};


// --- Component for Handling Calculations ---

const useQuotationCalculations = (quotation) => {
    return useMemo(() => {
        const subtotal = quotation.items.reduce((sum, item) => {
            const amount = (item.qty || 0) * (item.unitPrice || 0);
            return sum + amount;
        }, 0);

        const taxAmount = subtotal * (quotation.taxRate / 100);
        const totalBeforeDiscount = subtotal + taxAmount;
        const grandTotal = totalBeforeDiscount - (quotation.discount || 0);

        return {
            subtotal: parseFloat(subtotal.toFixed(2)),
            taxAmount: parseFloat(taxAmount.toFixed(2)),
            grandTotal: parseFloat(Math.max(0, grandTotal).toFixed(2)),
        };
    }, [quotation.items, quotation.taxRate, quotation.discount]);
};


// --- Component for Quotation Editor View ---

const QuotationEditor = ({ quotation, setQuotation, onSave, onBack, onDelete }) => {
    // Recalculate amounts whenever the quotation state changes
    const calculatedTotals = useQuotationCalculations(quotation);
    const { subtotal, grandTotal } = calculatedTotals;

    const handleInputChange = (e) => {
        const { name, value, type } = e.target;
        const updatedValue = type === 'number' ? parseFloat(value) || 0 : value;
        setQuotation(prev => ({ ...prev, [name]: updatedValue }));
    };

    const handleItemChange = (itemId, field, value) => {
        setQuotation(prev => {
            const updatedItems = prev.items.map(item => {
                if (item.id === itemId) {
                    const numericValue = parseFloat(value) || 0;
                    const newItem = { ...item, [field]: numericValue };
                    // Immediately calculate amount for the item based on new values
                    newItem.amount = parseFloat((newItem.qty * newItem.unitPrice).toFixed(2));
                    return newItem;
                }
                return item;
            });
            return { ...prev, items: updatedItems };
        });
    };

    const handleTextareaChange = (itemId, field, value) => {
        setQuotation(prev => ({
            ...prev,
            items: prev.items.map(item =>
                item.id === itemId ? { ...item, [field]: value } : item
            ),
        }));
    };

    const handleAddItem = () => {
        setQuotation(prev => ({
            ...prev,
            items: [...prev.items, getDefaultItem()],
        }));
    };

    const handleRemoveItem = (id) => {
        if (quotation.items.length > 1) {
            setQuotation(prev => ({
                ...prev,
                items: prev.items.filter(item => item.id !== id),
            }));
        }
    };

    const handlePrint = () => {
        window.print();
    };

    // Print specific styles are included in the main App styles below.
    return (
        <div className="p-4 md:p-8 bg-gray-50 min-h-screen">
            <div className="print:hidden flex justify-between items-center mb-6 max-w-4xl mx-auto">
                <button
                    onClick={onBack}
                    className="flex items-center text-sm font-semibold text-gray-600 hover:text-indigo-600 transition"
                >
                    <ChevronLeft className="w-4 h-4 mr-1" /> Back to Dashboard
                </button>
                <div className="flex space-x-2">
                    <button
                        onClick={handlePrint}
                        className="flex items-center px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition text-sm font-medium"
                    >
                        <Printer className="w-4 h-4 mr-2" /> Print PDF
                    </button>
                    <button
                        onClick={() => onSave({ ...quotation, ...calculatedTotals })}
                        className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm font-medium"
                    >
                        <FileText className="w-4 h-4 mr-2" /> Save Draft
                    </button>
                </div>
            </div>

            <div id="quotation-document" className="bg-white p-6 md:p-10 shadow-xl max-w-4xl mx-auto rounded-xl">
                {/* --- Letterhead Header --- */}
                <header className="text-center pb-4 mb-6 border-b-4 border-indigo-600">
                    <h1 className="text-3xl font-extrabold text-gray-800 tracking-wide">CHENNAI GRACY BOYS</h1>
                    <h2 className="text-lg font-medium text-gray-600 mt-1">A & Z EVENT MANAGEMENT</h2>
                    <div className="text-xs text-gray-500 mt-2">
                        <p>Chennai, Tamil Nadu, India | Phone: +91 XXXXX XXXXXX | Email: info@chennaigracyboys.com</p>
                    </div>
                </header>

                {/* --- Quotation Details --- */}
                <div className="mb-8">
                    <h3 className="text-xl font-bold text-gray-700 mb-4">QUOTATION</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div className="space-y-3">
                            <label className="block font-semibold text-gray-700">BILL TO *</label>
                            <input
                                type="text"
                                name="clientName"
                                value={quotation.clientName}
                                onChange={handleInputChange}
                                placeholder="Client Name"
                                className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                            />
                            <input
                                type="text"
                                name="companyName"
                                value={quotation.companyName}
                                onChange={handleInputChange}
                                placeholder="Company Name (Optional)"
                                className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                            />
                            <textarea
                                name="address"
                                value={quotation.address}
                                onChange={handleInputChange}
                                placeholder="Address"
                                rows="2"
                                className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                            ></textarea>
                            <input
                                type="text"
                                name="contactNumber"
                                value={quotation.contactNumber}
                                onChange={handleInputChange}
                                placeholder="Contact Number"
                                className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>
                        <div className="space-y-3">
                            <label className="block font-semibold text-gray-700">QUOTATION NUMBER</label>
                            <input
                                type="text"
                                name="quotationNumber"
                                value={quotation.quotationNumber}
                                onChange={handleInputChange} // Make editable
                                className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                            />
                            <label className="block font-semibold text-gray-700">DATE ISSUED</label>
                            <input
                                type="text"
                                value={quotation.dateIssued}
                                readOnly
                                className="w-full p-2 border border-gray-300 rounded-md bg-gray-100 text-gray-500"
                            />
                            <label className="block font-semibold text-gray-700">VALID UNTIL</label>
                            <input
                                type="date"
                                name="validUntil"
                                value={quotation.validUntil}
                                onChange={handleInputChange}
                                className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                            />
                            <div className='pt-8'>
                                <label className="block font-semibold text-gray-700">STATUS</label>
                                <select
                                    name="status"
                                    value={quotation.status}
                                    onChange={handleInputChange}
                                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                >
                                    <option value="Draft">Draft</option>
                                    <option value="Pending">Pending</option>
                                    <option value="Accepted">Accepted</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                {/* --- Line Items Table --- */}
                <h3 className="text-lg font-bold text-gray-700 mb-3">LINE ITEMS</h3>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10">S.No</th>
                                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/4">Requirements</th>
                                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">Qty</th>
                                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">Unit Price</th>
                                <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-20">Amount</th>
                                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/4">Remarks</th>
                                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10 print:hidden"></th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {quotation.items.map((item, index) => (
                                <tr key={item.id}>
                                    <td className="p-3 text-center text-gray-900">{index + 1}</td>
                                    <td className="p-3">
                                        <textarea
                                            rows="2"
                                            value={item.requirement}
                                            onChange={(e) => handleTextareaChange(item.id, 'requirement', e.target.value)}
                                            placeholder="Description of service/item"
                                            className="w-full p-2 border border-gray-200 rounded-md focus:ring-indigo-500 focus:border-indigo-500 resize-none print:border print:border-gray-300 print:rounded-md print:p-1"
                                        ></textarea>
                                    </td>
                                    <td className="p-3">
                                        <input
                                            type="number"
                                            min="0"
                                            value={item.qty}
                                            onChange={(e) => handleItemChange(item.id, 'qty', e.target.value)}
                                            className="w-16 p-2 border border-gray-200 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-center print:border print:border-gray-300 print:rounded-md print:p-1"
                                        />
                                    </td>
                                    <td className="p-3">
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={item.unitPrice}
                                            onChange={(e) => handleItemChange(item.id, 'unitPrice', e.target.value)}
                                            className="w-20 p-2 border border-gray-200 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-right print:border print:border-gray-300 print:rounded-md print:p-1"
                                        />
                                    </td>
                                    <td className="p-3 text-right font-semibold text-gray-800">
                                        ₹{(item.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="p-3">
                                        <textarea
                                            rows="2"
                                            value={item.remark}
                                            onChange={(e) => handleTextareaChange(item.id, 'remark', e.target.value)}
                                            placeholder="Notes for this item"
                                            className="w-full p-2 border border-gray-200 rounded-md focus:ring-indigo-500 focus:border-indigo-500 resize-none print:border print:border-gray-300 print:rounded-md print:p-1"
                                        ></textarea>
                                    </td>
                                    <td className="p-3 text-right print:hidden">
                                        <button
                                            onClick={() => handleRemoveItem(item.id)}
                                            className="text-red-500 hover:text-red-700 disabled:text-gray-400"
                                            disabled={quotation.items.length === 1}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <button
                    onClick={handleAddItem}
                    className="mt-4 flex items-center px-3 py-1 text-xs text-indigo-600 border border-indigo-600 rounded-full hover:bg-indigo-50 transition print:hidden"
                >
                    <Plus className="w-3 h-3 mr-1" /> Add Line Item
                </button>

                {/* --- Totals and Grand Total --- */}
                <div className="flex justify-end mt-8">
                    <div className="w-full md:w-96 space-y-2 text-sm">
                        <div className="flex justify-between font-medium">
                            <span>Subtotal:</span>
                            <span>₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>

                        <div className="flex justify-between items-center border-t pt-2">
                            <div className="flex items-center space-x-2">
                                <label className="text-gray-700">Tax/GST Rate:</label>
                                <input
                                    type="number"
                                    name="taxRate"
                                    value={quotation.taxRate}
                                    onChange={handleInputChange}
                                    className="w-16 p-1 border border-gray-300 rounded-md text-right print:border-none"
                                />
                                <span>%</span>
                            </div>
                            <span className="font-medium text-gray-800">
                                ₹{calculatedTotals.taxAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                        </div>

                        <div className="flex justify-between items-center">
                            <label className="text-gray-700">Discount:</label>
                            <input
                                type="number"
                                name="discount"
                                value={quotation.discount}
                                onChange={handleInputChange}
                                className="w-24 p-1 border border-gray-300 rounded-md text-right print:border-none"
                            />
                        </div>

                        <div className="flex justify-between text-lg font-extrabold text-indigo-700 border-t-2 border-indigo-600 pt-3 mt-3">
                            <span>Grand Total:</span>
                            <span>₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                    </div>
                </div>

                {/* --- Terms and Notes --- */}
                <div className="mt-10 pt-4 border-t border-gray-200 text-sm space-y-6">
                    <div>
                        <h4 className="font-bold text-gray-700 mb-2">TERMS & CONDITIONS</h4>
                        <textarea
                            name="terms"
                            value={quotation.terms}
                            onChange={handleInputChange}
                            rows="2"
                            className="w-full p-3 border border-gray-200 rounded-md resize-none focus:ring-indigo-500 focus:border-indigo-500 print:border print:border-gray-300 print:rounded-md print:p-1"
                        ></textarea>
                    </div>
                    <div>
                        <h4 className="font-bold text-gray-700 mb-2">NOTES</h4>
                        <textarea
                            name="notes"
                            value={quotation.notes}
                            onChange={handleInputChange}
                            rows="3"
                            className="w-full p-3 border border-gray-200 rounded-md resize-none focus:ring-indigo-500 focus:border-indigo-500 print:border print:border-gray-300 print:rounded-md print:p-1"
                        ></textarea>
                    </div>
                </div>

                <footer className="mt-8 pt-4 border-t border-gray-300 text-center text-xs text-gray-500">
                    <p>Thank you for the opportunity. We look forward to working with you.</p>
                    <p className="mt-1">Authorized Signature: _________________________</p>
                </footer>
            </div>
            <div className="print:hidden text-center mt-6">
                 <button
                    onClick={() => {
                        if (window.confirm("Are you sure you want to delete this quotation? This cannot be undone.")) {
                            onDelete(quotation.id);
                            onBack();
                        }
                    }}
                    className="text-red-500 hover:text-red-700 text-xs font-semibold"
                >
                    <Trash2 className="w-4 h-4 inline mr-1" /> Delete Quotation
                </button>
            </div>
        </div>
    );
};


// --- Component for Dashboard View ---

const Dashboard = ({ quotations, onNewQuotation, onEditQuotation, userId, isAuthReady, db }) => {
    const [searchTerm, setSearchTerm] = useState('');

    const filteredQuotations = useMemo(() => {
        const lowerCaseSearch = searchTerm.toLowerCase();
        return quotations.filter(q =>
            q.clientName?.toLowerCase().includes(lowerCaseSearch) ||
            q.quotationNumber?.toLowerCase().includes(lowerCaseSearch)
        ).sort((a, b) => b.createdAt?.getTime() - a.createdAt?.getTime()); // Use .getTime() for reliable sorting
    }, [quotations, searchTerm]);

    const stats = useMemo(() => {
        const total = filteredQuotations.length;
        const pending = filteredQuotations.filter(q => q.status === 'Pending').length;
        const accepted = filteredQuotations.filter(q => q.status === 'Accepted').length;
        
        // Use an extra check to ensure grandTotal is a valid number before summing
        const revenue = filteredQuotations
            .filter(q => q.status === 'Accepted')
            .reduce((sum, q) => sum + (q.grandTotal && !isNaN(q.grandTotal) ? q.grandTotal : 0), 0);

        return { total, pending, accepted, revenue: parseFloat(revenue.toFixed(2)) };
    }, [filteredQuotations]);

    const statCard = (title, value, icon, color) => (
        <div className="bg-white p-6 rounded-xl shadow-lg flex-1 min-w-[200px]">
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-sm font-medium text-gray-500">{title}</p>
                    <p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
                </div>
                <div className={`p-2 rounded-full ${color} bg-opacity-10`}>
                    {icon}
                </div>
            </div>
        </div>
    );

    return (
        <div className="p-4 md:p-8">
            <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Professional Event Management</h1>
            <p className="text-gray-500 mb-8">Chennai Gracy Boys - A & Z Event Management</p>

            {/* Stats Cards */}
            <div className="flex flex-wrap gap-4 mb-8">
                {statCard("TOTAL QUOTATIONS", stats.total, <FileText className="w-5 h-5 text-indigo-600" />, 'text-indigo-600')}
                {statCard("PENDING", stats.pending, <FileText className="w-5 h-5 text-yellow-600" />, 'text-yellow-600')}
                {statCard("ACCEPTED", stats.accepted, <FileText className="w-5 h-5 text-green-600" />, 'text-green-600')}
                {statCard("REVENUE", `₹${stats.revenue.toLocaleString('en-IN')}`, <span className="text-xl font-bold text-green-600">₹</span>, 'text-green-600')}
            </div>

            {/* Controls and Search */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-6">
                <div className="relative w-full md:w-80">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search quotations..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full p-2 pl-10 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    />
                </div>
                <button
                    onClick={onNewQuotation}
                    className="mt-4 md:mt-0 flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium shadow-md"
                    disabled={!isAuthReady}
                >
                    <Plus className="w-4 h-4 mr-2" /> New Quotation
                </button>
            </div>

            {/* Quotation List */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {isAuthReady && !db && (
                    <p className="col-span-full text-center text-red-500">Error: Database connection failed. Please check your Firebase configuration.</p>
                )}
                {isAuthReady && filteredQuotations.length === 0 ? (
                    <div className="col-span-full text-center p-10 bg-white rounded-xl shadow-lg">
                        <p className="text-gray-500">No quotations found. Start by creating a new one!</p>
                    </div>
                ) : (
                    filteredQuotations.map(q => (
                        <div key={q.id} className="bg-white p-5 rounded-xl shadow-lg border-l-4 border-indigo-500 hover:shadow-xl transition">
                            <div className="flex justify-between items-start mb-2">
                                <h3 className="text-lg font-semibold text-gray-800">{q.clientName}</h3>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                    q.status === 'Draft' ? 'bg-gray-100 text-gray-500' :
                                    q.status === 'Pending' ? 'bg-yellow-100 text-yellow-700' :
                                    'bg-green-100 text-green-700'
                                }`}>
                                    {q.status}
                                </span>
                            </div>

                            <p className="text-sm text-gray-500 mb-3">{q.quotationNumber}</p>

                            <div className="flex justify-between text-xs text-gray-600 mb-4">
                                <div>
                                    <p>Date:</p>
                                    <p className="font-medium">{formatDate(q.dateIssued)}</p>
                                </div>
                                <div className="text-right">
                                    <p>Total:</p>
                                    <p className="font-bold text-lg text-indigo-600">
                                        {/* Fallback to 0 if grandTotal is missing */}
                                        ₹{(q.grandTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                    </p>
                                </div>
                            </div>

                            <div className="flex space-x-2 pt-2 border-t">
                                <button
                                    onClick={() => onEditQuotation(q)}
                                    className="flex-1 flex justify-center items-center py-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition text-sm font-medium"
                                >
                                    <Edit className="w-4 h-4 mr-2" /> Edit
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <p className="mt-8 text-xs text-gray-400">User ID: {userId || 'Authenticating...'}</p>
        </div>
    );
};


// --- Main Application Component ---

const App = () => {
    const { db, userId, isAuthReady } = useFirebase();
    const [view, setView] = useState('dashboard'); // 'dashboard' or 'editor'
    const [quotations, setQuotations] = useState([]);
    const [currentQuotation, setCurrentQuotation] = useState(null);

    // --- Firestore Operations ---

    // 1. Fetch all quotations for the authenticated user
    useEffect(() => {
        if (db && userId) {
            const quotationsRef = collection(db, 'artifacts', appId, 'users', userId, 'quotations');
            const q = query(quotationsRef);

            console.log(`Setting up snapshot listener for user: ${userId}`);

            const unsubscribe = onSnapshot(q, (snapshot) => {
                const fetchedQuotations = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                    // Convert Firestore Timestamps to JS Date objects for consistency in sorting
                    createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : new Date(),
                }));
                setQuotations(fetchedQuotations);
            }, (error) => {
                console.error("Error listening to quotations:", error);
            });

            return () => unsubscribe();
        }
    }, [db, userId]);

    // 2. Save/Update Quotation
    const handleSaveQuotation = useCallback(async (quotationToSave) => {
        if (!db || !userId) return console.error("Database or User not ready.");

        // Recalculate totals before saving to ensure data integrity
        const calculatedTotals = useQuotationCalculations(quotationToSave);

        const finalQuotation = {
            ...quotationToSave,
            ...calculatedTotals, // Include calculated totals
            // Ensure date formats are consistent
            dateIssued: formatDate(new Date()),
            updatedAt: new Date(),
        };

        try {
            const docRef = doc(db, 'artifacts', appId, 'users', userId, 'quotations', finalQuotation.id);
            await setDoc(docRef, finalQuotation, { merge: true });
            console.log("Quotation saved successfully:", finalQuotation.id);
            setCurrentQuotation(finalQuotation); // Update current state with saved data
        } catch (error) {
            console.error("Error saving quotation:", error);
        }
    }, [db, userId]);

    // 3. Delete Quotation
    const handleDeleteQuotation = useCallback(async (quotationId) => {
        if (!db || !userId) return console.error("Database or User not ready.");
        try {
            const docRef = doc(db, 'artifacts', appId, 'users', userId, 'quotations', quotationId);
            await deleteDoc(docRef);
            console.log("Quotation deleted successfully:", quotationId);
        } catch (error) {
            console.error("Error deleting quotation:", error);
        }
    }, [db, userId]);

    // --- View Handlers ---

    const handleNewQuotation = () => {
        // Calculate the next quotation number based on the highest existing one
        const maxNum = quotations.reduce((max, q) => {
            const match = q.quotationNumber?.match(/(\d+)$/);
            return match ? Math.max(max, parseInt(match[1], 10)) : max;
        }, 0);
        
        const newQuote = getNewQuotation(maxNum);
        setCurrentQuotation(newQuote);
        setView('editor');
    };

    const handleEditQuotation = (quotation) => {
        setCurrentQuotation(quotation);
        setView('editor');
    };

    const handleBackToDashboard = () => {
        setCurrentQuotation(null);
        setView('dashboard');
    };

    // --- Loading State ---
    if (!isAuthReady) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100">
                <div className="text-lg font-medium text-gray-700">Loading Application...</div>
            </div>
        );
    }

    return (
        <div className="font-sans antialiased bg-gray-100">
            {/* Inline style block without the 'jsx' property to fix the warning */}
            <style>
                {`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap');
                body {
                    font-family: 'Inter', sans-serif;
                }
                /* Print Styles to hide UI elements and format the quote document */
                @media print {
                    .print\\:hidden, .print\\:hidden * {
                        display: none !important;
                    }
                    body {
                        background-color: white !important;
                    }
                    #quotation-document {
                        box-shadow: none !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        width: 100% !important;
                        max-width: none !important;
                    }
                    /* Ensure table and input borders are visible for the printout */
                    #quotation-document input, 
                    #quotation-document textarea {
                        border: 1px solid #ccc !important;
                        padding: 2px 4px !important;
                        background: transparent !important;
                        resize: none !important;
                    }
                    #quotation-document table {
                        width: 100% !important;
                        border-collapse: collapse;
                    }
                    #quotation-document th, #quotation-document td {
                        border: 1px solid #ddd !important;
                        padding: 8px !important;
                    }
                    #quotation-document header {
                        padding-bottom: 1rem !important;
                        margin-bottom: 1.5rem !important;
                        border-bottom-width: 4px !important;
                    }
                }
            `}
            </style>

            {view === 'dashboard' && (
                <Dashboard
                    quotations={quotations}
                    onNewQuotation={handleNewQuotation}
                    onEditQuotation={handleEditQuotation}
                    userId={userId}
                    isAuthReady={isAuthReady}
                    db={db}
                />
            )}

            {view === 'editor' && currentQuotation && (
                <QuotationEditor
                    quotation={currentQuotation}
                    setQuotation={setCurrentQuotation}
                    onSave={handleSaveQuotation}
                    onBack={handleBackToDashboard}
                    onDelete={handleDeleteQuotation}
                />
            )}
        </div>
    );
};

export default App;