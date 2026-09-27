import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Check, Package, Star, Loader, ChevronDown, ChevronUp, Plus, Minus, Crown, AlertTriangle, Image, FileText } from 'lucide-react';

// Helper to get image count (handles both camelCase and snake_case from API/DB)
const getImageCount = (pkg) => {
  if (!pkg) return null;
  return pkg.imageCount ?? pkg.image_count ?? null;
};

/**
 * PackageSelectionModal - Select packages and individual items
 * Displays pricing and generates invoice
 * Now with image limit validation
 */
const PackageSelectionModal = ({
  isOpen,
  onClose,
  lead,
  onPackagesSelected,
  onSendContract, // Called when user wants to send contract for signing
  onPackageSelected, // Called when user selects package and wants to pick images
  onChangeImages, // Called when user wants to change/add images after already selecting some
  // Props for image limit validation
  selectedPhotoCount = 0,
  selectedPhotoIds = [],
  onTrimSelection,
  // Preserve package selection when returning from image selection
  initialPackage = null
}) => {
  const [packages, setPackages] = useState({ main: [], individual: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMainPackage, setSelectedMainPackage] = useState(null);
  const [selectedIndividuals, setSelectedIndividuals] = useState({}); // {packageId: quantity}
  const [expandedPackage, setExpandedPackage] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [totals, setTotals] = useState({ subtotal: 0, vatAmount: 0, total: 0, items: [] });

  // Fetch packages
  const fetchPackages = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/packages', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch packages');
      }

      const data = await response.json();
      setPackages({
        main: data.mainPackages || [],
        individual: data.individualPackages || []
      });
    } catch (err) {
      console.error('Error fetching packages:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchPackages();
      // Only reset if no initial package provided (fresh start)
      // If initialPackage is provided, we're returning from image selection
      if (!initialPackage) {
        setSelectedMainPackage(null);
        setSelectedIndividuals({});
        setTotals({ subtotal: 0, vatAmount: 0, total: 0, items: [] });
      }
    }
  }, [isOpen, fetchPackages, initialPackage]);

  // Restore package selection when returning from image selection
  useEffect(() => {
    if (isOpen && initialPackage && packages.main.length > 0) {
      // Find the package in the loaded packages
      const pkg = packages.main.find(p => p.id === initialPackage.id);
      if (pkg) {
        setSelectedMainPackage(pkg);
      }
    }
  }, [isOpen, initialPackage, packages.main]);

  // Calculate totals when selection changes
  useEffect(() => {
    calculateTotals();
  }, [selectedMainPackage, selectedIndividuals]);

  const calculateTotals = async () => {
    const items = [];

    // Add main package if selected
    if (selectedMainPackage) {
      items.push({ packageId: selectedMainPackage.id, quantity: 1 });
    }

    // Add individual items
    Object.entries(selectedIndividuals).forEach(([packageId, quantity]) => {
      if (quantity > 0) {
        items.push({ packageId, quantity });
      }
    });

    if (items.length === 0) {
      setTotals({ subtotal: 0, vatAmount: 0, total: 0, items: [] });
      return;
    }

    setCalculating(true);

    try {
      const response = await fetch('/api/packages/calculate-total', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ items })
      });

      if (response.ok) {
        const data = await response.json();
        setTotals({
          subtotal: data.calculation.subtotal,
          vatAmount: data.calculation.vatAmount,
          total: data.calculation.total,
          items: data.calculation.items
        });
      }
    } catch (err) {
      console.error('Error calculating totals:', err);
    } finally {
      setCalculating(false);
    }
  };

  // Select main package
  const selectMainPackage = (pkg) => {
    if (selectedMainPackage?.id === pkg.id) {
      setSelectedMainPackage(null);
    } else {
      setSelectedMainPackage(pkg);
      // Clear individual items that are included in the package
      // This is optional - you might want to allow add-ons
    }
  };

  // Toggle individual item
  const toggleIndividual = (pkg, delta = 1) => {
    setSelectedIndividuals(prev => {
      const current = prev[pkg.id] || 0;
      const newQty = Math.max(0, current + delta);
      if (newQty === 0) {
        const { [pkg.id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [pkg.id]: newQty };
    });
  };

  // Format currency
  const formatCurrency = (amount) => {
    return `£${parseFloat(amount).toFixed(2)}`;
  };

  // Handle generate invoice
  // Image count info (no longer blocks - allows negotiation flexibility)
  const imageValidation = useMemo(() => {
    if (!selectedMainPackage) {
      return { valid: true, message: null, excess: 0 };
    }

    // Handle both camelCase (from API) and snake_case (from DB)
    const imageLimit = getImageCount(selectedMainPackage);

    // NULL means unlimited (full shoot)
    if (imageLimit === null || imageLimit === undefined) {
      return {
        valid: true,
        message: selectedPhotoCount > 0
          ? `${selectedPhotoCount} photos selected (unlimited included)`
          : 'Full shoot - unlimited images included',
        excess: 0
      };
    }

    if (selectedPhotoCount <= imageLimit) {
      return {
        valid: true,
        message: `${selectedPhotoCount} of ${imageLimit} photos selected`,
        excess: 0
      };
    }

    // More photos than package limit - still allow proceeding (price can be adjusted manually)
    const excess = selectedPhotoCount - imageLimit;
    return {
      valid: true, // Always valid - user can adjust price on next screen
      message: `${selectedPhotoCount} of ${imageLimit} photos selected (+${excess} extra)`,
      excess,
      hasExcess: true // Flag to show info message (not blocking)
    };
  }, [selectedMainPackage, selectedPhotoCount]);

  // Get package tier icon
  const getTierIcon = (code) => {
    switch (code) {
      case 'platinum':
        return <Crown className="w-5 h-5 text-purple-500" />;
      case 'gold':
        return <Star className="w-5 h-5 text-yellow-500" />;
      case 'silver':
        return <Star className="w-5 h-5 text-gray-400" />;
      default:
        return <Package className="w-5 h-5 text-blue-500" />;
    }
  };

  // Get tier gradient
  const getTierGradient = (code) => {
    switch (code) {
      case 'platinum':
        return 'from-purple-500 to-indigo-600';
      case 'gold':
        return 'from-yellow-500 to-amber-600';
      case 'silver':
        return 'from-gray-400 to-gray-600';
      case 'intro':
        return 'from-blue-500 to-cyan-600';
      default:
        return 'from-gray-500 to-gray-700';
    }
  };

  if (!isOpen) return null;

  const hasSelection = selectedMainPackage || Object.values(selectedIndividuals).some(q => q > 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-green-600 to-emerald-600">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-white bg-opacity-20 rounded-lg">
              <Package className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Select Package</h2>
              <p className="text-green-100 text-sm">
                {lead?.name ? `For ${lead.name}` : 'Choose a package for this client'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white hover:bg-opacity-20 rounded-full transition-colors"
          >
            <X className="w-6 h-6 text-white" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader className="w-10 h-10 text-green-600 animate-spin mb-4" />
              <p className="text-gray-500">Loading packages...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-20">
              <p className="text-red-600 font-medium">{error}</p>
              <button
                onClick={fetchPackages}
                className="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="p-6 space-y-8">
              {/* Main Packages */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <Package className="w-5 h-5 mr-2 text-green-600" />
                  Main Packages (VAT Inclusive)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {packages.main.map((pkg) => (
                    <div
                      key={pkg.id}
                      onClick={() => selectMainPackage(pkg)}
                      className={`relative cursor-pointer rounded-xl overflow-hidden transition-all duration-200 ${
                        selectedMainPackage?.id === pkg.id
                          ? 'ring-4 ring-green-500 ring-offset-2 transform scale-[1.02]'
                          : 'hover:shadow-xl hover:scale-[1.01]'
                      }`}
                    >
                      {/* Header */}
                      <div className={`p-4 bg-gradient-to-br ${getTierGradient(pkg.code)} text-white`}>
                        <div className="flex items-center justify-between mb-2">
                          {getTierIcon(pkg.code)}
                          {selectedMainPackage?.id === pkg.id && (
                            <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center">
                              <Check className="w-4 h-4 text-green-600" />
                            </div>
                          )}
                        </div>
                        <h4 className="text-xl font-bold">{pkg.name}</h4>
                        {pkg.totalValue && (
                          <p className="text-sm opacity-80 line-through">
                            Value: {formatCurrency(pkg.totalValue)}
                          </p>
                        )}
                        <p className="text-2xl font-bold mt-1">
                          {formatCurrency(pkg.price)}
                        </p>
                      </div>

                      {/* Details */}
                      <div className="p-4 bg-white border border-gray-200 border-t-0 rounded-b-xl">
                        {/* Image count display - prominent */}
                        {(() => {
                          const pkgImageCount = getImageCount(pkg);
                          const isValid = pkgImageCount === null || selectedPhotoCount <= (pkgImageCount || 0);
                          return (
                            <div className={`flex items-center justify-between py-2 px-3 rounded-lg mb-3 ${
                              selectedMainPackage?.id === pkg.id
                                ? isValid
                                  ? 'bg-green-50 border border-green-200'
                                  : 'bg-red-50 border border-red-200'
                                : 'bg-gray-50'
                            }`}>
                              <div className="flex items-center space-x-2">
                                <Image className={`w-4 h-4 ${
                                  selectedMainPackage?.id === pkg.id
                                    ? isValid ? 'text-green-600' : 'text-red-500'
                                    : 'text-gray-500'
                                }`} />
                                <span className={`text-sm font-medium ${
                                  selectedMainPackage?.id === pkg.id
                                    ? isValid ? 'text-green-700' : 'text-red-700'
                                    : 'text-gray-700'
                                }`}>
                                  {pkgImageCount === null
                                    ? 'Full Shoot'
                                    : `${pkgImageCount} images`}
                                </span>
                              </div>
                              {selectedMainPackage?.id === pkg.id && selectedPhotoCount > 0 && (
                                <span className={`text-xs font-medium ${isValid ? 'text-green-600' : 'text-red-600'}`}>
                                  {pkgImageCount === null
                                    ? `${selectedPhotoCount} selected`
                                    : `${selectedPhotoCount}/${pkgImageCount}`}
                                </span>
                              )}
                            </div>
                          );
                        })()}

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedPackage(expandedPackage === pkg.id ? null : pkg.id);
                          }}
                          className="flex items-center justify-between w-full text-sm text-gray-600 hover:text-gray-900"
                        >
                          <span>What's included</span>
                          {expandedPackage === pkg.id ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>

                        {expandedPackage === pkg.id && pkg.includes && (
                          <ul className="mt-3 space-y-1.5">
                            {pkg.includes.map((item, idx) => (
                              <li key={idx} className="flex items-start text-sm text-gray-600">
                                <Check className="w-4 h-4 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Individual Items */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <Plus className="w-5 h-5 mr-2 text-green-600" />
                  Individual Items (+VAT)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {packages.individual.map((pkg) => {
                    const quantity = selectedIndividuals[pkg.id] || 0;
                    const price = parseFloat(pkg.price) || 0;
                    const priceWithVat = price * 1.2; // Add 20% VAT for display

                    return (
                      <div
                        key={pkg.id}
                        className={`p-4 rounded-xl border-2 transition-all ${
                          quantity > 0
                            ? 'border-green-500 bg-green-50'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="font-medium text-gray-900">{pkg.name}</h4>
                            <p className="text-sm text-gray-500 mt-1">{pkg.description}</p>
                            <p className="text-lg font-semibold text-gray-900 mt-2">
                              {formatCurrency(pkg.price)}
                              <span className="text-sm font-normal text-gray-500"> +VAT</span>
                            </p>
                            <p className="text-xs text-gray-400">
                              ({formatCurrency(priceWithVat)} inc. VAT)
                            </p>
                          </div>

                          {/* Quantity controls */}
                          <div className="flex items-center space-x-2 ml-4">
                            <button
                              onClick={() => toggleIndividual(pkg, -1)}
                              disabled={quantity === 0}
                              className="p-1.5 rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <span className="w-8 text-center font-medium">{quantity}</span>
                            <button
                              onClick={() => toggleIndividual(pkg, 1)}
                              className="p-1.5 rounded-lg border border-green-500 bg-green-500 text-white hover:bg-green-600"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {pkg.includes && pkg.includes.length > 0 && (
                          <ul className="mt-3 space-y-1">
                            {pkg.includes.slice(0, 2).map((item, idx) => (
                              <li key={idx} className="flex items-center text-xs text-gray-500">
                                <Check className="w-3 h-3 text-green-500 mr-1.5" />
                                {item}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Order Summary Footer */}
        <div className="border-t bg-gray-50 p-6">
          <div className="flex items-start justify-between">
            {/* Summary */}
            <div className="flex-1">
              <h4 className="font-medium text-gray-900 mb-2">Order Summary</h4>
              {totals.items.length > 0 ? (
                <div className="space-y-1 text-sm">
                  {totals.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-gray-600">
                      <span>
                        {item.name}
                        {item.quantity > 1 && ` x${item.quantity}`}
                      </span>
                      <span>{formatCurrency(item.lineTotal)}</span>
                    </div>
                  ))}
                  <div className="pt-2 border-t mt-2 space-y-1">
                    <div className="flex justify-between text-gray-600">
                      <span>Subtotal</span>
                      <span>{formatCurrency(totals.subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>VAT (20%)</span>
                      <span>{formatCurrency(totals.vatAmount)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500">No items selected</p>
              )}
            </div>

            {/* Total & Actions */}
            <div className="ml-8 text-right">
              <div className="mb-4">
                <p className="text-sm text-gray-500">Total</p>
                <p className="text-3xl font-bold text-gray-900">
                  {calculating ? (
                    <Loader className="w-6 h-6 animate-spin inline" />
                  ) : (
                    formatCurrency(totals.total)
                  )}
                </p>

                {/* Photo count status */}
                {selectedPhotoCount > 0 && selectedMainPackage && (
                  <div className={`mt-2 text-sm flex items-center justify-end space-x-1 ${
                    imageValidation.hasExcess ? 'text-amber-600' : 'text-green-600'
                  }`}>
                    <Image className="w-4 h-4" />
                    <span>{imageValidation.message}</span>
                  </div>
                )}
              </div>

              {/* Image excess info notice (non-blocking) */}
              {imageValidation.hasExcess && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-left">
                  <div className="flex items-start space-x-2">
                    <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-800">
                        {imageValidation.excess} extra photo{imageValidation.excess > 1 ? 's' : ''} beyond package limit - you can adjust pricing on next screen
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex space-x-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>

                {/* Select Images Button - Show when package selected but no photos yet */}
                {onPackageSelected && selectedMainPackage && selectedPhotoCount === 0 && (
                  <button
                    onClick={() => onPackageSelected(selectedMainPackage)}
                    className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center space-x-2"
                  >
                    <Image className="w-4 h-4" />
                    <span>Select Images{getImageCount(selectedMainPackage) ? ` (${getImageCount(selectedMainPackage)} max)` : ' (Unlimited)'}</span>
                  </button>
                )}

                {/* Change Images Button - Show when photos already selected */}
                {selectedMainPackage && selectedPhotoCount > 0 && (onChangeImages || onPackageSelected) && (
                  <button
                    onClick={() => (onChangeImages || onPackageSelected)(selectedMainPackage)}
                    className="px-4 py-2 bg-purple-100 text-purple-700 border border-purple-300 rounded-lg hover:bg-purple-200 transition-colors flex items-center space-x-2"
                  >
                    <Image className="w-4 h-4" />
                    <span>Change Images ({selectedPhotoCount})</span>
                  </button>
                )}

                {/* Generate Invoice Button - Show when package selected */}
                {onSendContract && selectedMainPackage && (
                  <button
                    onClick={() => onSendContract({
                      leadId: lead.id,
                      package: selectedMainPackage,
                      items: totals.items,
                      totals: totals
                    })}
                    disabled={calculating}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Generate Invoice</span>
                  </button>
                )}

                {/* Individual Items - Generate Invoice */}
                {!selectedMainPackage && Object.values(selectedIndividuals).some(q => q > 0) && (
                  <>
                    {/* Generate Invoice for Individual Items */}
                    {onSendContract && (
                      <button
                        onClick={() => {
                          // Create a combined package from individual items for contract
                          const individualItemsList = Object.entries(selectedIndividuals)
                            .filter(([_, qty]) => qty > 0)
                            .map(([pkgId, qty]) => {
                              const pkg = packages.individual.find(p => p.id === pkgId);
                              return pkg ? { ...pkg, quantity: qty } : null;
                            })
                            .filter(Boolean);

                          // Check what extras were actually purchased by item name/code
                          const allItemNames = individualItemsList.map(i => (i.name || '').toLowerCase() + ' ' + (i.code || '').toLowerCase()).join(' ');

                          const combinedPackage = {
                            id: 'individual-items',
                            name: individualItemsList.map(i => `${i.name}${i.quantity > 1 ? ` x${i.quantity}` : ''}`).join(', '),
                            code: 'individual',
                            price: totals.subtotal,
                            vatInclusive: false,
                            vatRate: 20,
                            includes: individualItemsList.flatMap(i => i.includes || []),
                            // Explicit flags based on actual purchased items (by name/code, not includes)
                            hasZCard: allItemNames.includes('z-card') || allItemNames.includes('zcard'),
                            hasEfolio: allItemNames.includes('efolio') || allItemNames.includes('e-folio'),
                            hasProjectInfluencer: allItemNames.includes('influencer'),
                            has3Lance: allItemNames.includes('3lance') || allItemNames.includes('casting'),
                            hasAgencyList: allItemNames.includes('agency') || allItemNames.includes('agency list')
                          };

                          onSendContract({
                            leadId: lead.id,
                            package: combinedPackage,
                            items: totals.items,
                            totals: totals
                          });
                        }}
                        disabled={calculating}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
                      >
                        <FileText className="w-4 h-4" />
                        <span>Generate Invoice</span>
                      </button>
                    )}

                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PackageSelectionModal;
